import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  Image,
  FlatList,
} from "react-native";
import React, { useEffect, useState } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import AnimatedCounter from "@/components/AnimatedCounter";
import icons from "@/constants/icons";
import { useRouter } from "expo-router";
import { useFetchData } from "@/hooks/useFetchData";
import { useGlobalContext } from "@/lib/global-provider";
import LottieView from "lottie-react-native";
import { RefreshControl } from "react-native";

const Wallets = () => {
  const router = useRouter();
  const { user } = useGlobalContext();

  const [wallets, setWallets] = useState<any[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const {
    wallets: initialWallets,
    error,
    loading,
    refetch,
  } = useFetchData(user?.$id);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useEffect(() => {
    if (initialWallets) {
      setWallets(initialWallets);
    }
  }, [initialWallets]);

  // connect to WebSocket for live updates
  useEffect(() => {
    if (!user?.$id) return;

    const socket = new WebSocket("ws://localhost:3000");

    socket.onopen = () => {
      console.log("✅ Wallets WS connected");
      socket.send(JSON.stringify({ type: "user_connected", userId: user.$id }));
    };

    socket.onclose = () => console.log("❌ Wallets WS disconnected");

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "wallet_created") {
        setWallets((prev) => [...prev, data.wallet]);
      }

      if (data.type === "wallet_deleted") {
        setWallets((prev) => prev.filter((w) => w.$id !== data.walletId));
      }

      if (data.type === "wallet_updated") {
        setWallets((prev) =>
          prev.map((w) => (w.$id === data.wallet.$id ? data.wallet : w)),
        );
      }
    };

    return () => socket.close();
  }, [user?.$id]);

  const totalBalance = () => {
    if (!wallets || wallets.length === 0) return 0;
    return wallets.reduce((acc, wallet) => acc + (wallet.amount || 0), 0);
  };

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

  return (
    <SafeAreaView className="flex-1 bg-white">
      {loading && wallets.length === 0 ? (
        <Text className="text-center mt-10">Loading wallets...</Text>
      ) : error ? (
        <Text className="text-center mt-10 text-red-500">{error}</Text>
      ) : wallets.length === 0 ? (
        // Show Lottie animation when there are no wallets
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <LottieView
            style={{ width: 250, height: 250 }}
            source={require("../../../assets/animations/Budgeting.json")}
            autoPlay
            loop
          />
          <Text style={{ marginTop: 16, fontSize: 18, color: "#4B5563" }}>
            No wallets yet
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/walletModal")}
            className="bg-black-1"
            style={{
              marginTop: 20,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white", fontSize: 16 }}>Add Wallet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-1 p-8 pb-24">
          {/* Blue Box Container */}
          <View className="bg-blue-50 p-8 rounded-2xl flex-1">
            {/* Total Balance */}
            <View className="justify-center items-center mb-6">
              <AnimatedCounter amount={totalBalance()} />
              <Text className="text-2xl text-gray-600 mt-2">Total Balance</Text>
            </View>

            {/* My Wallets Header */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-semibold text-black-1">
                My Wallets
              </Text>
              <TouchableOpacity onPress={() => router.push("/walletModal")}>
                <Image source={icons.addWallet} className="w-8 h-8" />
              </TouchableOpacity>
            </View>

            {/* Wallets List */}
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
                    className="flex-row items-center w-full p-4 bg-white rounded-xl shadow-sm border border-gray-100"
                  >
                    {item.image ? (
                      <Image
                        source={{ uri: item.image }}
                        className="w-12 h-12 rounded-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <Image
                        source={icons.wallet}
                        className="w-12 h-12"
                        resizeMode="cover"
                      />
                    )}

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
      )}
    </SafeAreaView>
  );
};

export default Wallets;
