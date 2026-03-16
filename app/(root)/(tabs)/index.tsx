import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  SafeAreaView,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Text
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import HeaderBox from "@/components/HeaderBox";
import HomeCard from "@/components/HomeCard";
import { TransactionsList } from "@/components/TransactionsList";
import { useGlobalContext } from "@/lib/global-provider";
import { useWalletStore } from "@/lib/walletStore";
import icons from "@/constants/icons";
import { useTransactionData } from "@/hooks/userTransactionData";
import { useWalletData } from "@/hooks/useWalletData";
import BudgetAlertBanner from "@/components/BudgetAlertBanner";
import { useSocket } from "@/context/SocketContext";

const Home = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useGlobalContext();
  const {
    wallets: storeWallets,
    transactions: storeTransactions,
    setWallets,
    setTransactions
  } = useWalletStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  // ── Budget alert banner ───────────────────────────────────────────────────
  const { budgetAlerts, clearBudgetAlerts } = useSocket();

  const { wallets: queryWallets, isLoading: isLoadingWallets } =
    useWalletData();
  useEffect(() => {
    if (queryWallets) setWallets(queryWallets);
  }, [queryWallets]);

  const { data: queryTransactions, isLoading: isLoadingTransactions } =
    useTransactionData();
  useEffect(() => {
    if (queryTransactions) setTransactions(queryTransactions);
  }, [queryTransactions]);

  const filteredTransactions = useMemo(() => {
    if (!selectedWalletId) return storeTransactions;
    return (
      storeTransactions?.filter((t) => t.walletId === selectedWalletId) ?? []
    );
  }, [storeTransactions, selectedWalletId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries(["wallets", user?.$id]),
      queryClient.invalidateQueries(["transactions", user?.$id])
    ]);
    setRefreshing(false);
  }, [queryClient, user?.$id]);

  if (!user) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const isLoading = isLoadingWallets || isLoadingTransactions;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <BudgetAlertBanner alerts={budgetAlerts} onDismiss={clearBudgetAlerts} />

      <BlurView
        intensity={90}
        tint="light"
        className="absolute top-0 left-0 right-0 z-40"
      >
        <View className="p-6 mt-12">
          <View className="flex flex-row items-end justify-between">
            <HeaderBox
              type="greeting"
              title="Welcome"
              user={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()}
              subtext="Manage your account and transactions efficiently."
            />
            <TouchableOpacity onPress={() => router.push("/searchModal")}>
              <Image source={icons.search} className="size-8" />
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 24,
          paddingTop: 100
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <HomeCard onWalletSelect={setSelectedWalletId} />
        <TransactionsList
          title="Recent Transactions"
          data={filteredTransactions}
          loading={isLoading}
        />
      </ScrollView>

      <TouchableOpacity
        className="absolute bottom-24 right-2 z-50"
        onPress={() => router.push("/transactionModal")}
      >
        <Image source={icons.addT} className="size-12" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default Home;
