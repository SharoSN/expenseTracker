import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
} from "react-native";
import React, { useCallback, useState } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import LottieView from "lottie-react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import AnimatedCounter from "@/components/AnimatedCounter";
import icons from "@/constants/icons";
import { useGlobalContext } from "@/lib/global-provider";
import { useWalletData } from "@/hooks/useWalletData";

const Wallets = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useGlobalContext();

  // ✅ Use ONLY the custom hook (it handles everything!)
  const { wallets, isLoading, isError, error, totalBalance } = useWalletData();

  const [refreshing, setRefreshing] = useState(false);



  // ✅ Pull-to-refresh handler
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
        image: item?.image,
      },
    });
  };

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
            <AnimatedCounter amount={totalBalance} />
            <Text className="text-2xl text-gray-600 mt-2">Total Balance</Text>
          </View>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-semibold text-black-1">
              My Wallets
            </Text>
            <TouchableOpacity onPress={() => router.push("/(modal)/walletModal")}>
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
                <Animated.View
                  entering={FadeInDown.delay(index * 100).duration(400)}
                  className="flex-row items-center w-full p-4 bg-white rounded-xl shadow-sm"
                >
                  <View className="w-14 h-14 rounded-full overflow-hidden bg-sky-50 p-1">
                    <Image
                      source={item.image ? { uri: item.image } : icons.wallet}
                      className="w-full h-full p-1  rounded-full"
                      resizeMode="cover"
                    />
                  </View>
                  <View className="flex-1 flex-row items-center justify-between ml-4">
                    <View>
                      <Text className="text-lg font-medium text-gray-900">
                        {item.name}
                      </Text>
                      <Text className="text-sm text-gray-600">
                        ${item.amount}
                      </Text>
                    </View>
                    <Image source={icons.rightArrow} className="w-6 h-6" />
                  </View>
                </Animated.View>
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
