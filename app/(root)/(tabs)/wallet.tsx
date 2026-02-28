import {
  View,
  Text,
  SafeAreaView,
  Image,
  FlatList,
  RefreshControl,
  TouchableOpacity
} from "react-native";
import React, { useCallback, useState } from "react";
import LottieView from "lottie-react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import AnimatedCounter from "@/components/AnimatedCounter";
import icons from "@/constants/icons";
import { useGlobalContext } from "@/lib/global-provider";
import { useWalletData } from "@/hooks/useWalletData";
import { getWalletIconSource } from "@/lib/walletIconHelper";
import { formatCurrency, useWalletStore } from "@/lib/walletStore";

const Wallets = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useGlobalContext();

  // ✅ FIX: Subscribe to currency changes to trigger re-render
  const currency = useWalletStore((state) => state.currency);

  const { wallets, isLoading, isError, error, totalBalance } = useWalletData();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["wallets", user?.$id] });
    setRefreshing(false);
  }, [queryClient, user?.$id]);

  const openWallet = (item: any) => {
    router.push({
      pathname: "/(modal)/walletModal",
      params: {
        id: item?.$id,
        name: item?.name,
        image: item?.image
      }
    });
  };

  // ✅ FIX: Format totalBalance with selected currency
  const formattedTotalBalance = formatCurrency(totalBalance, currency);

  const renderContent = () => {
    if (isLoading && wallets.length === 0) {
      return <Text className="text-center mt-10">Loading wallets...</Text>;
    }

    if (isError) {
      return (
        <Text className="text-center mt-10 text-red-500">
          Error: {error?.message}
        </Text>
      );
    }

    if (wallets.length === 0) {
      return (
        <View className="flex-1 justify-center items-center">
          <LottieView
            style={{ width: 250, height: 250 }}
            source={require("../../../assets/animations/Budgeting.json")}
            autoPlay
            loop
          />
          <Text className="mt-4 text-lg text-gray-600">No wallets yet</Text>
          <TouchableOpacity
            onPress={() => router.push("/(modal)/walletModal")}
            className="bg-black-1 mt-5 px-6 py-3 rounded-xl"
          >
            <Text className="text-white text-base">Add Wallet</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="flex-1 p-8 pb-24">
        <View className="bg-blue-50 p-8 rounded-2xl flex-1">
          <View className="justify-center items-center mb-6">
            {/* ✅ FIX: Pass formatted balance string to AnimatedCounter */}
            <AnimatedCounter
              amount={totalBalance}
              displayText={formattedTotalBalance}
              currency={currency}
            />
            <Text className="text-2xl text-gray-600 mt-2">Total Balance</Text>
          </View>

          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-semibold text-black-1">
              My Wallets
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(modal)/walletModal")}
            >
              <Image source={icons.addWallet} className="w-8 h-8" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={wallets}
            keyExtractor={(item) => item.$id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onPress={() => openWallet(item)}
                className="mb-3"
              >
                <View className="flex-row items-center w-full p-4 bg-white rounded-xl shadow-sm">
                  <View className="w-14 h-14 rounded-full overflow-hidden justify-center items-center">
                    {/* ✅ Use the helper function instead of { uri: item.image } */}
                    <Image
                      source={getWalletIconSource(item.image)}
                      className="w-10 h-10"
                      resizeMode="contain"
                    />
                  </View>

                  <View className="flex-1 flex-row items-center justify-between ml-4">
                    <View>
                      <Text className="text-lg font-medium text-gray-900">
                        {item.name}
                      </Text>
                      {/* ✅ FIX: Always pass currency to formatCurrency */}
                      <Text className="text-sm text-gray-600">
                        {formatCurrency(item.amount, currency)}
                      </Text>
                    </View>
                    <Image source={icons.rightArrow} className="w-6 h-6" />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">{renderContent()}</SafeAreaView>
  );
};

export default Wallets;
