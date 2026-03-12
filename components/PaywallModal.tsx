import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  StyleSheet,
  Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  TrendingUp,
  BarChart2,
  Zap,
  PieChart,
  Lock
} from "lucide-react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── Pro features list ────────────────────────────────────────────────────────
const PRO_FEATURES = [
  {
    icon: TrendingUp,
    color: "#4fc3f7",
    label: "Month-over-Month Trends",
    desc: "See exactly how each category shifted vs last month"
  },
  {
    icon: BarChart2,
    color: "#34d399",
    label: "Weekly Spending Charts",
    desc: "8-week visual breakdown of your spending patterns"
  },
  {
    icon: PieChart,
    color: "#f59e0b",
    label: "Category Breakdown",
    desc: "Full percentage split across all spending categories"
  },
  {
    icon: Zap,
    color: "#a78bfa",
    label: "Smart AI Insights",
    desc: "Personalized observations — weekend habits, anomalies & more"
  }
];

// ─── Animated feature row ─────────────────────────────────────────────────────
const FeatureRow = ({
  feature,
  index
}: {
  feature: (typeof PRO_FEATURES)[0];
  index: number;
}) => {
  const slide = useRef(new Animated.Value(32)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const Icon = feature.icon;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 400,
        delay: 300 + index * 90,
        useNativeDriver: true
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay: 300 + index * 90,
        useNativeDriver: true
      })
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.featureRow,
        { opacity, transform: [{ translateX: slide }] }
      ]}
    >
      <View
        style={[
          styles.featureIcon,
          {
            backgroundColor: feature.color + "18",
            borderColor: feature.color + "40"
          }
        ]}
      >
        <Icon size={18} color={feature.color} strokeWidth={2} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureLabel}>{feature.label}</Text>
        <Text style={styles.featureDesc}>{feature.desc}</Text>
      </View>
    </Animated.View>
  );
};

// ─── Main PaywallModal ────────────────────────────────────────────────────────
type Props = {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void; // wire to RevenueCat when ready
};

export const PaywallModal = ({ visible, onClose, onUpgrade }: Props) => {
  const { top, bottom } = useSafeAreaInsets();

  // Entry animations
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(SCREEN_H)).current;
  const headerScale = useRef(new Animated.Value(0.88)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset
      backdropOpacity.setValue(0);
      sheetTranslate.setValue(SCREEN_H * 0.08);
      headerScale.setValue(0.88);
      headerOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true
        }),
        Animated.spring(sheetTranslate, {
          toValue: 0,
          tension: 68,
          friction: 13,
          useNativeDriver: true
        }),
        Animated.timing(headerScale, {
          toValue: 1,
          duration: 420,
          delay: 120,
          useNativeDriver: true
        }),
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 340,
          delay: 80,
          useNativeDriver: true
        })
      ]).start();

      // Pulse on CTA button
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.03,
            duration: 900,
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true
          })
        ])
      ).start();

      // Glow shimmer on header orb
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1600,
            useNativeDriver: true
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1600,
            useNativeDriver: true
          })
        ])
      ).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.timing(sheetTranslate, {
        toValue: SCREEN_H * 0.1,
        duration: 220,
        useNativeDriver: true
      })
    ]).start(() => onClose());
  };

  const orbGlow = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1]
  });

  const orbScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08]
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingTop: top + 16,
            paddingBottom: bottom + 24,
            transform: [{ translateY: sheetTranslate }]
          }
        ]}
      >
        {/* Close button */}
        <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
          <X size={18} color="#94a3b8" strokeWidth={2} />
        </Pressable>

        {/* ── Header ── */}
        <Animated.View
          style={[
            styles.headerBlock,
            { opacity: headerOpacity, transform: [{ scale: headerScale }] }
          ]}
        >
          {/* Orb */}
          <Animated.View
            style={[
              styles.orbOuter,
              { opacity: orbGlow, transform: [{ scale: orbScale }] }
            ]}
          >
            <View style={styles.orbInner}>
              <Lock size={26} color="#4fc3f7" strokeWidth={1.8} />
            </View>
          </Animated.View>

          {/* Badge */}
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>VELORA PRO</Text>
          </View>

          <Text style={styles.headline}>
            Unlock Your Full{"\n"}Financial Picture
          </Text>
          <Text style={styles.subheadline}>
            Basic analytics show you where money went.{"\n"}
            Pro shows you{" "}
            <Text style={styles.subheadlineAccent}>
              why — and what to do next.
            </Text>
          </Text>
        </Animated.View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* ── Features ── */}
        <View style={styles.featuresBlock}>
          {PRO_FEATURES.map((f, i) => (
            <FeatureRow key={f.label} feature={f} index={i} />
          ))}
        </View>

        {/* ── CTA ── */}
        <View style={styles.ctaBlock}>
          {/* Upgrade button */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Pressable
              style={({ pressed }) => [
                styles.upgradeBtn,
                pressed && styles.upgradeBtnPressed
              ]}
              onPress={onUpgrade}
            >
              <View style={styles.upgradeBtnInner}>
                <Zap
                  size={16}
                  color="#0a0f1e"
                  strokeWidth={2.5}
                  fill="#0a0f1e"
                />
                <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Pricing note — placeholder until RevenueCat */}
          <Text style={styles.pricingNote}>
            Pricing coming soon · Cancel anytime
          </Text>

          {/* Dismiss */}
          <Pressable onPress={handleClose} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Maybe later</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 14, 28, 0.82)"
  },

  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0a0f1e",
    paddingHorizontal: 24
  },

  closeBtn: {
    alignSelf: "flex-end",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(148,163,184,0.08)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },

  // ── Header ──
  headerBlock: {
    alignItems: "center",
    marginBottom: 28
  },

  orbOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(79,195,247,0.08)",
    borderWidth: 1,
    borderColor: "rgba(79,195,247,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#4fc3f7",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8
  },

  orbInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(79,195,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(79,195,247,0.35)",
    alignItems: "center",
    justifyContent: "center"
  },

  proBadge: {
    backgroundColor: "rgba(79,195,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(79,195,247,0.3)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14
  },

  proBadgeText: {
    color: "#4fc3f7",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5
  },

  headline: {
    color: "#f1f5f9",
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 33,
    marginBottom: 12
  },

  subheadline: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21
  },

  subheadlineAccent: {
    color: "#94a3b8",
    fontWeight: "600"
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(148,163,184,0.08)",
    marginBottom: 24
  },

  // ── Features ──
  featuresBlock: {
    gap: 14,
    marginBottom: 32,
    flex: 1
  },

  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },

  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  featureText: {
    flex: 1
  },

  featureLabel: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
    marginBottom: 2
  },

  featureDesc: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 17
  },

  // ── CTA ──
  ctaBlock: {
    alignItems: "center",
    gap: 12
  },

  upgradeBtn: {
    width: SCREEN_W - 48,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#4fc3f7",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4fc3f7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8
  },

  upgradeBtnPressed: {
    backgroundColor: "#38b2e0",
    shadowOpacity: 0.2
  },

  upgradeBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },

  upgradeBtnText: {
    color: "#0a0f1e",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2
  },

  pricingNote: {
    color: "#334155",
    fontSize: 11,
    letterSpacing: 0.3
  },

  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16
  },

  dismissText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "500"
  }
});
