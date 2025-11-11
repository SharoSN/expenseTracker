import React, { useEffect, useState } from "react";
import {
  View,
  SafeAreaView,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Text,
} from "react-native";
import HeaderBox from "@/components/HeaderBox";
import { useGlobalContext } from "@/lib/global-provider";
import icons from "@/constants/icons";
import HomeCard from "@/components/HomeCard";
import Transactionslist from "@/components/TransactisonsList";
import { useRouter } from "expo-router";
import { getUserTransactions } from "@/lib/appwrite";

const Home = () => {
  const { user } = useGlobalContext();
  const router = useRouter();

  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // If no user, redirect to sign-in page
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    setCheckingAuth(false);
  }, [user, router]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user?.$id) return;

      setLoadingTransactions(true);
      try {
        const txs = await getUserTransactions(user.$id);
        setTransactions(txs);
      } catch (error) {
        console.error("Failed to fetch transactions", error);
      } finally {
        setLoadingTransactions(false);
      }
    };

    if (user?.$id) {
      fetchTransactions();
    }
  }, [user?.$id]);

  if (checkingAuth) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#0000ff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-6">
        <View className="flex flex-row items-end justify-between">
          <HeaderBox
            type="greeting"
            title="Welcome"
            user={
              `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
              "Guest"
            }
            subtext="Manage your account and transactions efficiently."
          />

          <TouchableOpacity onPress={() => router.push("/searchModal")}>
            <Image source={icons.search} className="size-8" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <HomeCard />

        <View>
          <Transactionslist
            title="Recent Transactions"
            data={transactions}
            loading={loadingTransactions}
          />
        </View>
      </ScrollView>

      <TouchableOpacity
        className="absolute bottom-24 right-2 z-50"
        onPress={() => router.push("/transactionModal")}
      >
        <Image className="size-12" source={icons.addT} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default Home;
