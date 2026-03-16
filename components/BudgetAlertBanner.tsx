import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions
} from "react-native";

export interface BudgetAlert {
  severity: "warning" | "exceeded";
  label: string;
  category: string | null;
  spent: number;
  limit: number;
  overBy?: number;
  remaining?: number;
  pct: number;
}

interface Props {
  alerts: BudgetAlert[];
  onDismiss: () => void;
}

export default function BudgetAlertBanner({ alerts, onDismiss }: Props) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (alerts.length > 0) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true
        })
      ]).start();
    }
  }, [alerts]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 300,
        useNativeDriver: true
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      })
    ]).start(() => onDismiss());
  };

  if (alerts.length === 0) return null;

  const hasExceeded = alerts.some((a) => a.severity === "exceeded");
  const primaryAlert =
    alerts.find((a) => a.severity === "exceeded") || alerts[0];

  const bgColor = hasExceeded ? "#ff4d6d" : "#f59e0b";
  const emoji = hasExceeded ? "🚨" : "⚠️";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim
        }
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.textBlock}>
          <Text style={styles.title}>
            {hasExceeded
              ? `Budget exceeded — ${primaryAlert.label}`
              : `Budget warning — ${primaryAlert.label}`}
          </Text>
          <Text style={styles.detail}>
            {primaryAlert.severity === "exceeded"
              ? `€${primaryAlert.spent.toFixed(2)} spent · €${primaryAlert.overBy!.toFixed(2)} over limit`
              : `€${primaryAlert.spent.toFixed(2)} of €${primaryAlert.limit.toFixed(2)} (${primaryAlert.pct}%)`}
          </Text>
          {alerts.length > 1 && (
            <Text style={styles.more}>
              +{alerts.length - 1} more alert{alerts.length > 2 ? "s" : ""}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressBar,
            { width: `${Math.min(primaryAlert.pct, 100)}%` }
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingTop: 52,
    paddingBottom: 12,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  emoji: {
    fontSize: 22
  },
  textBlock: {
    flex: 1
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  detail: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 2
  },
  more: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 2
  },
  closeBtn: {
    padding: 4
  },
  closeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "600"
  },
  progressTrack: {
    marginTop: 8,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    overflow: "hidden"
  },
  progressBar: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 2
  }
});
