import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, Platform } from "react-native";

// ─── Spinning Glowing Orb ─────────────────────────────────────────────────────
const AIOrb = ({ isActive }: { isActive: boolean }) => {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: isActive ? 500 : 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: isActive ? 500 : 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    ).start();
  }, [isActive]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, isActive ? 1.1 : 1.04]
  });
  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1]
  });

  return (
    <Animated.View
      style={{
        width: 64,
        height: 64,
        transform: [{ scale }],
        opacity: glowOpacity
      }}
    >
      {/* Outer spinning gradient ring */}
      <Animated.View
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 32,
          borderWidth: 2,
          borderTopColor: "#4fc3f7",
          borderRightColor: "#7c6ff7",
          borderBottomColor: "#43e8a0",
          borderLeftColor: "transparent",
          transform: [{ rotate }]
        }}
      />
      {/* Second counter ring */}
      <Animated.View
        style={{
          position: "absolute",
          inset: 6,
          borderRadius: 26,
          borderWidth: 1,
          borderTopColor: "rgba(124,111,247,0.4)",
          borderRightColor: "transparent",
          borderBottomColor: "rgba(79,195,247,0.3)",
          borderLeftColor: "transparent",
          transform: [
            {
              rotate: spin.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "-360deg"]
              })
            }
          ]
        }}
      />
      {/* Core */}
      <View
        style={{
          position: "absolute",
          inset: 12,
          borderRadius: 20,
          backgroundColor: "rgba(79,195,247,0.12)",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: isActive ? "#4fc3f7" : "#7c6ff7",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isActive ? 0.9 : 0.5,
          shadowRadius: isActive ? 14 : 7,
          elevation: 6
        }}
      >
        <Text style={{ fontSize: 16 }}>✦</Text>
      </View>
    </Animated.View>
  );
};

// ─── Animated Waveform ────────────────────────────────────────────────────────
const WAVE_HEIGHTS = [
  8, 16, 26, 20, 32, 24, 36, 28, 20, 30, 18, 26, 14, 22, 10
];

const Waveform = ({ isActive }: { isActive: boolean }) => {
  const animations = useRef(
    WAVE_HEIGHTS.map(() => new Animated.Value(4))
  ).current;

  useEffect(() => {
    const loops = animations.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 70),
          Animated.timing(anim, {
            toValue: isActive ? WAVE_HEIGHTS[i] : 4,
            duration: isActive ? 380 : 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false
          }),
          Animated.timing(anim, {
            toValue: 4,
            duration: isActive ? 380 : 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false
          })
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [isActive]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        height: 40
      }}
    >
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: anim,
            borderRadius: 2,
            backgroundColor: i % 2 === 0 ? "#4fc3f7" : "#7c6ff7",
            opacity: isActive ? 0.85 : 0.25
          }}
        />
      ))}
    </View>
  );
};

// ─── Status dot ───────────────────────────────────────────────────────────────
const StatusDot = ({ isActive }: { isActive: boolean }) => {
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true
        })
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: isActive ? "#4fc3f7" : "#43e8a0",
        opacity: blink,
        marginRight: 5
      }}
    />
  );
};

// ─── Main Export: AIAvatarHeader ──────────────────────────────────────────────
// Drop this anywhere in your screen above <ChatInterface />
// Props:
//   isLoading — pass your `loading` state so the orb + waveform react to AI activity
//   name      — optional: AI name label (default "Aria")

interface AIAvatarHeaderProps {
  isLoading: boolean;
  name?: string;
}

const AIAvatarHeader = ({
  isLoading,
  name = "Velora"
}: AIAvatarHeaderProps) => {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(79,195,247,0.15)",
        padding: 18,
        overflow: "hidden",
        // Soft background that works on both light and dark themes
        backgroundColor: "rgba(79,195,247,0.04)"
      }}
    >
      {/* Subtle ambient glow in corner */}
      <View
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: "rgba(124,111,247,0.06)"
        }}
      />

      {/* Row: orb + name/status */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          marginBottom: 14
        }}
      >
        <AIOrb isActive={isLoading} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
              marginBottom: 4
              // No hardcoded color — inherits from your app theme
            }}
          >
            {name} · AI Assistant
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <StatusDot isActive={isLoading} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "500",
                color: isLoading ? "#4fc3f7" : "#43e8a0"
              }}
            >
              {isLoading ? "Thinking..." : "Ready"}
            </Text>
          </View>
        </View>
      </View>

      {/* Waveform */}
      <Waveform isActive={isLoading} />
    </View>
  );
};

export default AIAvatarHeader;
