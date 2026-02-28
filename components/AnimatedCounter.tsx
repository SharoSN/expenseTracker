import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useWalletStore } from "@/lib/walletStore";

interface AnimatedCounterProps {
  amount: number;
  displayText?: string;
  currency?: string;
}

const AnimatedCounter = ({
  amount,
  displayText,
  currency = "EUR"
}: AnimatedCounterProps) => {
  const displayCurrency = useWalletStore((state) => state.currency);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(amount, {
      duration: 500
    });
  }, [amount, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      // Animation can be applied here if needed
    };
  });

  // ✅ FIX: Use displayText if provided (already formatted with currency)
  // Otherwise, just show the amount with currency symbol
  const getCurrencySymbol = () => {
    const currencyToUse = currency || displayCurrency;
    if (currencyToUse === "EUR") return "€";
    if (currencyToUse === "USD") return "$";
    if (currencyToUse === "GBP") return "£";
    if (currencyToUse === "JPY") return "¥";
    if (currencyToUse === "CAD") return "C$";
    if (currencyToUse === "AUD") return "A$";
    return "€";
  };

  // ✅ If displayText is provided (already formatted), use it
  // This is the formatted string like "$110.00" or "€100.00"
  if (displayText) {
    return (
      <Animated.View style={animatedStyle}>
        <Text className="text-3xl font-bold text-black text-center">
          {displayText}
        </Text>
      </Animated.View>
    );
  }

  // Fallback: format without full currency conversion
  const symbol = getCurrencySymbol();
  const formatted = amount.toFixed(2);

  return (
    <Animated.View style={animatedStyle}>
      <Text className="text-5xl font-bold text-blue-900 text-center">
        {symbol}
        {formatted}
      </Text>
    </Animated.View>
  );
};

export default AnimatedCounter;
