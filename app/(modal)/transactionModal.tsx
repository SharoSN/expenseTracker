// TransactionModal.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import BackButton from "@/components/BackButton";
import HeaderBox from "@/components/HeaderBox";
import TransactionDatePicker from "@/components/TransactionDatePicker";
import TransactionForm from "@/components/TransactionForm";
import WalletDropdownComponent from "@/components/WalletDropdown";
import { Input } from "@/~/components/ui/input";

import icons from "@/constants/icons";
import { useGlobalContext } from "@/lib/global-provider";
import {
  useWalletStore,
  formatInDisplayCurrency,
  CURRENCIES
} from "@/lib/walletStore";
import {
  createOrUpdateTransaction,
  handleDeleteTransaction
} from "@/lib/appwrite";
import { TransactionType } from "@/types";

const TransactionModal = () => {
  const { user } = useGlobalContext();
  const params = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Global state
  const { wallets } = useWalletStore();
  const displayCurrency = useWalletStore((state) => state.currency);
  const displayCurrencyConfig = CURRENCIES[displayCurrency];

  const [walletName, setWalletName] = useState<string>("");

  const [transaction, setTransaction] = useState<
    TransactionType & { amountText?: string }
  >({
    type: "expense",
    amount: 0,
    amountText: "",
    description: "",
    category: "",
    date: new Date(),
    walletId: ""
  });

  const isEditMode = !!params?.id;

  // Load transaction when editing - run ONLY when params.id changes
  useEffect(() => {
    if (params?.id) {
      const oldTx = params as any;

      const parsedTransaction = {
        id: oldTx.id,
        type: oldTx.type || "expense",
        amount: Number(oldTx.amount),
        amountText: String(oldTx.amount),
        description: oldTx.description || "",
        category: oldTx.category || "",
        date: new Date(oldTx.date),
        walletId: oldTx.walletId || ""
      };

      setTransaction(parsedTransaction);

      // Find and display wallet name
      const wallet = wallets.find((w) => w.$id === oldTx.walletId);
      if (wallet) {
        setWalletName(wallet.name);
      }
    }
  }, [params?.id, wallets]);

  // Auto-select first wallet on initial load (create mode only)
  useEffect(() => {
    if (!params?.id && wallets.length > 0 && !transaction.walletId) {
      setTransaction((prev) => ({ ...prev, walletId: wallets[0].$id }));
      setWalletName(wallets[0].name);
    }
  }, [wallets, params?.id, transaction.walletId]);

  // == Mutations using React Query ==
  const saveTransactionMutation = useMutation({
    mutationFn: createOrUpdateTransaction,
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({
        queryKey: ["transactions", user?.$id]
      });
      await queryClient.cancelQueries({ queryKey: ["wallets", user?.$id] });

      const previousTransactions = queryClient.getQueryData([
        "transactions",
        user?.$id
      ]);

      queryClient.setQueryData(["transactions", user?.$id], (old: any) => {
        const optimisticTransaction = {
          ...newTransaction,
          $id: params?.id || `optimistic-${Date.now()}`
        };
        if (params?.id) {
          return old.map((t: any) =>
            t.$id === params.id ? optimisticTransaction : t
          );
        } else {
          return [optimisticTransaction, ...old];
        }
      });

      return { previousTransactions };
    },
    onError: (err: any, newTransaction, context: any) => {
      queryClient.setQueryData(
        ["transactions", user?.$id],
        context?.previousTransactions
      );
      Alert.alert("Error", err?.message || "Failed to save transaction.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.$id] });
      queryClient.invalidateQueries({ queryKey: ["wallets", user?.$id] });
      Alert.alert(
        "Success",
        params?.id ? "Transaction updated" : "Transaction added"
      );
      router.back();
    }
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: handleDeleteTransaction,
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({
        queryKey: ["transactions", user?.$id]
      });
      await queryClient.cancelQueries({ queryKey: ["wallets", user?.$id] });

      const previousTransactions = queryClient.getQueryData([
        "transactions",
        user?.$id
      ]);

      queryClient.setQueryData(["transactions", user?.$id], (old: any) => {
        return old?.filter((t: any) => t.$id !== deletedId) ?? [];
      });

      return { previousTransactions };
    },
    onError: (err: any, deletedId, context: any) => {
      queryClient.setQueryData(
        ["transactions", user?.$id],
        context?.previousTransactions
      );
      Alert.alert("Error", err?.message || "Failed to delete transaction.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.$id] });
      queryClient.invalidateQueries({ queryKey: ["wallets", user?.$id] });
      Alert.alert("Deleted", "Transaction has been deleted");
      router.back();
    }
  });

  // == Handlers ==
  const handleSave = async () => {
    const { type, amount, description, date, category, walletId } = transaction;

    if (
      !walletId ||
      !date ||
      !amount ||
      amount <= 0 ||
      (type === "expense" && !category)
    ) {
      Alert.alert("Invalid Data", "Please fill all required fields correctly.");
      return;
    }

    // ✅ Save in EUR (database stores EUR, regardless of display currency)
    saveTransactionMutation.mutate({
      id: params?.id as string,
      type,
      amount, // ✅ Always EUR amount
      description,
      category,
      date,
      walletId
    });
  };

  const handleDelete = () => {
    if (!params?.id) return;
    Alert.alert(
      "Delete Transaction",
      `Are you sure you want to delete this transaction from "${walletName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteTransactionMutation.mutate(params.id as string)
        }
      ]
    );
  };

  const onSelectWallet = useCallback(
    (id: string) => {
      const wallet = wallets.find((w) => w.$id === id);
      if (wallet) {
        // Show warning if changing wallet in edit mode
        if (isEditMode && transaction.walletId !== id) {
          Alert.alert(
            "Change Wallet",
            `Move this transaction from "${walletName}" to "${wallet.name}"?`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Change",
                style: "default",
                onPress: () => {
                  setTransaction((prev) => ({ ...prev, walletId: id }));
                  setWalletName(wallet.name);
                }
              }
            ]
          );
        } else {
          setTransaction((prev) => ({ ...prev, walletId: id }));
          setWalletName(wallet.name);
        }
      }
    },
    [wallets, isEditMode, transaction.walletId, walletName]
  );

  const isPending =
    saveTransactionMutation.isPending || deleteTransactionMutation.isPending;

  // ✅ FIX: Display amount preview in selected currency
  const getDisplayAmount = () => {
    if (!transaction.amount)
      return `${displayCurrencyConfig?.symbol || "€"}0.00`;
    return formatInDisplayCurrency(transaction.amount);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <BlurView intensity={100} tint="light" style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View className="flex-1 px-10 pt-6">
            <View className="flex-row items-center justify-between mb-6">
              <BackButton />
              <HeaderBox
                type="greeting"
                title={isEditMode ? "Update Transaction" : "New Transaction"}
                subtext={
                  isEditMode ? `Wallet: ${walletName}` : "Add a new transaction"
                }
              />
              {isEditMode ? (
                <TouchableOpacity onPress={handleDelete} disabled={isPending}>
                  <Image
                    source={icons.deleteIcon}
                    className="w-6 h-6"
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} />
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TransactionForm
                transaction={transaction}
                setTransaction={setTransaction}
              />

              <View className="mt-8">
                <Text className="text-lg font-medium text-gray-700">
                  Wallet
                </Text>
                <WalletDropdownComponent
                  wallets={wallets}
                  selectedWalletId={transaction.walletId as string}
                  onSelectWallet={onSelectWallet}
                />
              </View>

              <View className="mt-8">
                <Text className="text-lg font-medium text-gray-700">Date</Text>
                <TransactionDatePicker
                  transaction={transaction}
                  setTransaction={setTransaction}
                />
              </View>

              <View className="mt-6">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-lg font-medium text-gray-700">
                    Amount
                  </Text>
                </View>

                <Input
                  keyboardType="numeric"
                  value={transaction.amountText}
                  onChangeText={(value) => {
                    if (/^\d*\.?\d*$/.test(value)) {
                      setTransaction((prev) => ({
                        ...prev,
                        amountText: value,
                        amount: parseFloat(value) || 0
                      }));
                    }
                  }}
                  placeholder="0.00"
                  className="border border-gray-500 rounded-lg w-full p-4 mt-3 h-16"
                  editable={!isPending}
                />

                {/* ✅ FIX: Add helper text */}
                <Text className="text-xs text-gray-500 mt-2">
                  Enter amount in EUR (€). It will be converted for display.
                </Text>
              </View>

              <View className="mt-6 mb-8">
                <Text className="text-lg font-medium text-gray-700">
                  Description
                </Text>
                <Input
                  value={transaction.description}
                  onChangeText={(value) =>
                    setTransaction((prev) => ({ ...prev, description: value }))
                  }
                  placeholder="e.g. Groceries"
                  className="border border-gray-500 rounded-lg w-full h-40 p-4 mt-3"
                  editable={!isPending}
                  multiline
                />
              </View>
            </ScrollView>

            <View className="gap-4 mt-6 mb-6">
              <TouchableOpacity
                onPress={handleSave}
                disabled={isPending}
                className={`w-full rounded-lg p-3 ${
                  isPending ? "bg-gray-400" : "bg-black-1"
                }`}
              >
                <Text className="text-white text-center font-medium text-lg">
                  {saveTransactionMutation.isPending
                    ? "Saving..."
                    : isEditMode
                    ? "Update Transaction"
                    : "Save Transaction"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </SafeAreaView>
  );
};

export default TransactionModal;
