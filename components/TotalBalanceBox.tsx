import { View, Text } from "react-native";
import React from "react";
import DoughnatChart from "./DoughnatChart";
import AnimatedCounter from "./AnimatedCounter";

const TotalBalanceBox = ({
  totalCurrentBalance,
}: {
  totalCurrentBalance: number;
}) => {
  return (
    <View className="flex flex-row justify-between w-full items-center rounded-xl border border-gray-200 p-6 shadow-chart">
      <View className="flex items-center">
        <DoughnatChart />
      </View>

      <View className="flex flex-col gap-6">
        <Text className="text-2xl font-semibold text-gray-900">
          Bank Accounts: 1
        </Text>

        <View>
          <Text className="text-xl font-medium text-gray-600">
            Total Current Balance
          </Text>
          <View className="flex justify-center items-center mt-4">
            <AnimatedCounter amount={totalCurrentBalance} />
          </View>
        </View>
      </View>
    </View>
  );
};

export default TotalBalanceBox;
