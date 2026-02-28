import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native";
import HeaderBox from "@/components/HeaderBox";
import BackButton from "@/components/BackButton";
import { Input } from "@/~/components/ui/input";

import { useGlobalContext } from "@/lib/global-provider";
import { getUserTransactions } from "@/lib/appwrite";
import { TransactionsList } from "@/components/TransactionsList";
import { BlurView } from "expo-blur";

const SearchModal = () => {
  const { user } = useGlobalContext();
  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  const fetchTransactions = async () => {
    try {
      if (user?.$id) {
        const result = await getUserTransactions(user.$id);
        setTransactions(result);
        setFilteredTransactions(result);
      }
    } catch (error) {
      console.error("Failed to fetch transactions", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    const filtered = transactions.filter((txn) => {
      const query = searchQuery.toLowerCase();

      return (
        txn.description?.toLowerCase().includes(query) ||
        txn.category?.toLowerCase().includes(query) ||
        txn.type?.toLowerCase().includes(query) ||
        txn.amount?.toString().includes(query) ||
        txn.date?.toLowerCase().includes(query)
      );
    });

    setFilteredTransactions(filtered);
  }, [searchQuery, transactions]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <BlurView intensity={30} tint="light" style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View className="flex-1 p-10">
            {/* Header */}
            <View className="flex flex-row gap-24 items-end">
              <BackButton />
              <HeaderBox
                type="Search Transactions"
                title="Search"
                subtext="Find transactions"
              />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1 }}
              className="w-full max-w-md"
            >
              <View className="flex flex-col w-full mt-8">
                <Text className="text-lg font-medium text-gray-700 mb-1">
                  Search
                </Text>
                <Input
                  placeholder="Search by description, amount, category, or type..."
                  autoCapitalize="none"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 h-14"
                />

                <TransactionsList
                  title="Matching Transactions"
                  data={filteredTransactions}
                  loading={loadingTransactions}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </SafeAreaView>
  );
};

export default SearchModal;
