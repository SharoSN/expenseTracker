import { View, Text, StyleSheet, Image } from "react-native";
import React from "react";
import { SafeAreaView } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import icons from "@/constants/icons";
import { useFetchData } from "@/hooks/useFetchData";
import AnimatedCounter from "./AnimatedCounter";
import { useGlobalContext } from "@/lib/global-provider";
import { useMemo } from "react";

const HomeCard = () => {
  const { user } = useGlobalContext();

  const { wallets, error, loading } = useFetchData(user?.$id);

  // ...

  const { totalBalance, totalIncome, totalExpense } = useMemo(() => {
    if (!wallets || wallets.length === 0) {
      return { totalBalance: 0, totalIncome: 0, totalExpense: 0 };
    }

    return wallets.reduce(
      (totals, wallet) => {
        totals.totalBalance += wallet.amount || 0;
        totals.totalIncome += wallet.totalIncome || 0;
        totals.totalExpense += wallet.totalExpense || 0;
        return totals;
      },
      { totalBalance: 0, totalIncome: 0, totalExpense: 0 }
    );
  }, [wallets]);

  return (
    <SafeAreaView className="bg-white items-center">
      <View className="w-[90%] h-[300px] relative">
        {/* Stack Layer 1 */}
        <View className="absolute top-0 left-0 right-0 h-[240px] bg-[#FBCFE8] rounded-3xl z-10 scale-[0.94] shadow-sm" />

        {/* Stack Layer 2 */}
        <View className="absolute top-4 left-0 right-0 h-[240px] bg-[#A5B4FC] rounded-3xl z-20 scale-[0.97] shadow-md" />

        {/* Main Card */}
        <View className="absolute top-8 left-0 right-0 h-[260px] rounded-3xl overflow-hidden shadow-lg  z-30 bg-white">
          {/* Gradient Background */}
          <LinearGradient
            colors={["#B3E5FC", "#C5CAE9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Card Content */}
          <View className="p-6 flex-1 justify-between">
            <View className="flex-row justify-between items-center ">
              <Text className="text-black text-2xl font-bold mt-4">
                Total Balance
              </Text>
              <View className="flex-row gap-1">
                <Image source={icons.dots} className="size-6" />
              </View>
            </View>

            <View className="text-black text-3xl font-bold mt-2">
              <AnimatedCounter amount={totalBalance} />
            </View>

            <View className="flex flex-row justify-between">
              {/* Income */}
              <View className="flex flex-col items-center">
                <View className="flex flex-row gap-2 items-center">
                  <Image source={icons.arrowDown} className="w-6 h-6" />
                  <Text className="font-semibold">Income</Text>
                </View>
                <Text className="text-green-600 font-bold text-xl mt-2">
                  {totalIncome}
                </Text>
              </View>

              {/* Expense */}
              <View className="flex flex-col items-center">
                <View className="flex flex-row gap-2 items-center">
                  <Image source={icons.arrowUp} className="w-6 h-6" />
                  <Text className="font-semibold">Expense</Text>
                </View>
                <Text className="text-red-600 font-bold text-xl mt-2">
                  {totalExpense}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default HomeCard;
