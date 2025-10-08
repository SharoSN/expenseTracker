import { View, Text } from "react-native";
import React from "react";
import AnimateNumber from "react-native-countup";
import { formatMoney } from "@/lib/utils"; // Importing formatCurrency from utils

const AnimatedCounter = ({ amount }: { amount: number }) => {
  return (
    <View>
      <AnimateNumber
        value={amount}
        formatter={(val: any) => formatMoney(parseFloat(val.toFixed(2)))}
        // Use the imported formatCurrency function for formatting
        style={{ fontSize: 22, fontWeight: "600" }}
      />
    </View>
  );
};

export default AnimatedCounter;
