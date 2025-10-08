// components/CustomTabBar.tsx
import { BlurView } from "expo-blur";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { View } from "react-native";
import { Tabs } from "expo-router";

export default function CustomTabBar(props: BottomTabBarProps) {
  return (
    <BlurView
      tint="light"
      intensity={50}
      style={{
        position: "absolute",
        bottom: 10,
        left: 20,
        right: 20,
        overflow: "hidden",
        borderRadius: 30
      }}
    >
      <View
        style={{
          borderTopWidth: 0.5,
          borderColor: "rgba(0,0,0,0.15)"
        }}
      >
        <Tabs.TabBar {...props} />
      </View>
    </BlurView>
  );
}
