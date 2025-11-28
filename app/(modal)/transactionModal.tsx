
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
  View,
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
import { useWalletStore } from "@/lib/walletStore";
import {
  createOrUpdateTransaction,
  handleDeleteTransaction,
  pickDocument,
  removeTransactionReceipt,
  uploadReceipt,
} from "@/lib/appwrite";
import { TransactionType } from "@/types";

const TransactionModal = () => {
  const { user } = useGlobalContext();
  const params = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Global state
  const { wallets, setWallets, setTransactions } = useWalletStore();

  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const [transaction, setTransaction] = useState<
    TransactionType & { amountText?: string; newImageFile?: any }
  >({
    type: "expense",
    amount: 0,
    amountText: "",
    description: "",
    category: "",
    date: new Date(),
    walletId: "",
    image: null,
  });

  // Load transaction when editing - run ONLY when params.id changes
  useEffect(() => {
    if (params?.id && !isInitialized) {
      const oldTx = params as any;
      let imageFileId: string | null = null;
      if (oldTx.image) {
        const parts = oldTx.image.split("/");
        const fileIdIndex = parts.findIndex((part) => part === "files") + 1;
        if (fileIdIndex > 0 && fileIdIndex < parts.length) {
          imageFileId = parts[fileIdIndex];
        }
      }

      setTransaction({
        ...oldTx,
        id: oldTx.id,
        amount: Number(oldTx.amount),
        amountText: String(oldTx.amount),
        date: new Date(oldTx.date),
        walletId: oldTx.walletId ?? "",
        image: imageFileId,
        newImageFile: null,
      });

      setReceiptImageUri(oldTx.image ?? null);
      setIsInitialized(true);
    }
  }, [params?.id]); // ← Only depend on the ID string, not the entire params object

  // Auto-select first wallet on initial load - only when wallets first become available
  useEffect(() => {
    if (!transaction.walletId && wallets.length > 0 && !isInitialized) {
      setTransaction((prev) => ({ ...prev, walletId: wallets[0].$id }));
      setIsInitialized(true);
    }
  }, []); // ← Empty dependency array - runs only once on mount

  // == Mutations using React Query ==
  const saveTransactionMutation = useMutation({
    mutationFn: createOrUpdateTransaction,
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", user?.$id] });
      await queryClient.cancelQueries({ queryKey: ["wallets", user?.$id] });

      const previousTransactions = queryClient.getQueryData(["transactions", user?.$id]);

      queryClient.setQueryData(["transactions", user?.$id], (old: any) => {
        const optimisticTransaction = {
          ...newTransaction,
          $id: params?.id || `optimistic-${Date.now()}`,
        };
        if (params?.id) {
          return old.map((t: any) => (t.$id === params.id ? optimisticTransaction : t));
        } else {
          return [optimisticTransaction, ...old];
        }
      });

      return { previousTransactions };
    },
    onError: (err: any, newTransaction, context: any) => {
      queryClient.setQueryData(["transactions", user?.$id], context?.previousTransactions);
      Alert.alert("Error", err?.message || "Failed to save transaction.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.$id] });
      queryClient.invalidateQueries({ queryKey: ["wallets", user?.$id] });
      Alert.alert("Success", params?.id ? "Transaction updated" : "Transaction added");
      router.back();
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: handleDeleteTransaction,
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ["transactions", user?.$id] });
      await queryClient.cancelQueries({ queryKey: ["wallets", user?.$id] });

      const previousTransactions = queryClient.getQueryData(["transactions", user?.$id]);

      queryClient.setQueryData(["transactions", user?.$id], (old: any) => {
        return old?.filter((t: any) => t.$id !== deletedId) ?? [];
      });

      return { previousTransactions };
    },
    onError: (err: any, deletedId, context: any) => {
      queryClient.setQueryData(["transactions", user?.$id], context?.previousTransactions);
      Alert.alert("Error", err?.message || "Failed to delete transaction.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.$id] });
      queryClient.invalidateQueries({ queryKey: ["wallets", user?.$id] });
      Alert.alert("Deleted", "Transaction has been deleted");
      router.back();
    },
  });

  const removeReceiptMutation = useMutation({
    mutationFn: removeTransactionReceipt,
    onSuccess: () => {
      Alert.alert("Success", "Receipt image removed!");
      setReceiptImageUri(null);
      setTransaction((prev) => ({ ...prev, image: null }));
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to remove receipt.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.$id] });
    },
  });

  // == Handlers ==
  const handleSave = async () => {
    const { type, amount, description, date, category, walletId, image, newImageFile } = transaction;

    if (!walletId || !date || !amount || amount <= 0 || (type === "expense" && !category)) {
      Alert.alert("Invalid Data", "Please fill all required fields correctly.");
      return;
    }

    let finalImageId = image;
    if (newImageFile) {
      try {
        const uploadedFile = await uploadReceipt(newImageFile);
        finalImageId = uploadedFile?.$id ?? null;
      } catch (uploadError) {
        Alert.alert("Upload Error", "Failed to upload receipt image.");
        return;
      }
    }

    saveTransactionMutation.mutate({
      id: params?.id as string,
      type,
      amount,
      description,
      category,
      date,
      walletId,
      image: finalImageId,
    });
  };

  const handleDelete = () => {
    if (!params?.id) return;
    Alert.alert("Delete Transaction", "Are you sure you want to delete this transaction?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteTransactionMutation.mutate(params.id as string),
      },
    ]);
  };

  const handleRemoveReceipt = () => {
    if (!params?.id) return;
    removeReceiptMutation.mutate(params.id as string);
  };

  const handleUpload = useCallback(async () => {
    const pickedFile = await pickDocument();
    if (!pickedFile) return;
    setReceiptImageUri(pickedFile.uri);
    setTransaction((prev) => ({ ...prev, newImageFile: pickedFile, image: null }));
  }, []);

  const onSelectWallet = useCallback((id: string) => {
    setTransaction((prev) => ({ ...prev, walletId: id }));
  }, []);

  const isPending =
    saveTransactionMutation.isPending || deleteTransactionMutation.isPending || removeReceiptMutation.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <BlurView intensity={100} tint="light" style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View className="flex-1 px-10 pt-6">
            <View className="flex-row items-center justify-between mb-6">
              <BackButton />
              <HeaderBox
                type="greeting"
                title={params?.id ? "Update Transaction" : "Transaction"}
                subtext={params?.id ? "Edit Transaction" : "Add Transaction"}
              />
              {params?.id ? (
                <TouchableOpacity onPress={handleDelete} disabled={isPending}>
                  <Image source={icons.deleteIcon} className="w-6 h-6" resizeMode="contain" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} />
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TransactionForm transaction={transaction} setTransaction={setTransaction} />

              <View className="mt-8">
                <Text className="text-lg font-medium text-gray-700">Wallet</Text>
                <WalletDropdownComponent
                  wallets={wallets}
                  selectedWalletId={(transaction.walletId as string) || ""}
                  onSelectWallet={onSelectWallet}
                />
              </View>

              <View className="mt-8">
                <Text className="text-lg font-medium text-gray-700">Date</Text>
                <TransactionDatePicker transaction={transaction} setTransaction={setTransaction} />
              </View>

              <View className="mt-6">
                <Text className="text-lg font-medium text-gray-700 mb-1">Amount</Text>
                <Input
                  keyboardType="numeric"
                  value={transaction.amountText}
                  onChangeText={(value) => {
                    if (/^\d*\.?\d*$/.test(value)) {
                      setTransaction((prev) => ({
                        ...prev,
                        amountText: value,
                        amount: parseFloat(value) || 0,
                      }));
                    }
                  }}
                  placeholder="0.00"
                  className="border border-gray-500 rounded-lg w-full p-4 mt-3"
                  editable={!isPending}
                />
              </View>

              <View className="mt-6">
                <Text className="text-lg font-medium text-gray-700">Description</Text>
                <Input
                  value={transaction.description}
                  onChangeText={(value) => setTransaction((prev) => ({ ...prev, description: value }))}
                  placeholder="e.g. Groceries"
                  className="border border-gray-500 rounded-lg w-full h-20 p-4 mt-3"
                  editable={!isPending}
                  multiline
                />
              </View>

              <View className="mt-6">
                <Text className="text-lg font-medium text-gray-700">Receipt</Text>
                {receiptImageUri && (
                  <View className="my-2 self-start relative">
                    <Image source={{ uri: receiptImageUri }} className="w-24 h-24 rounded-full border" />
                    <TouchableOpacity
                      onPress={handleRemoveReceipt}
                      className="absolute top-[-8px] right-[-8px] bg-white rounded-full p-1"
                      disabled={isPending}
                    >
                      <Image source={icons.remove} className="w-6 h-6" />
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  onPress={handleUpload}
                  className="w-full rounded-lg border border-gray-600 p-4 bg-black-1 mt-4"
                  disabled={isPending}
                >
                  <View className="flex-row items-center gap-2 justify-center">
                    <Image source={icons.upload} className="w-6 h-6" style={{ tintColor: "white" }} />
                    <Text className="text-white text-center font-medium text-lg">Upload Image</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View className="gap-4 mt-6">
              <TouchableOpacity
                onPress={handleSave}
                disabled={isPending}
                className={`w-full rounded-lg p-3 ${isPending ? "bg-gray-400" : "bg-black-1"}`}
              >
                <Text className="text-white text-center font-medium text-lg">
                  {saveTransactionMutation.isPending ? "Saving..." : params?.id ? "Update Transaction" : "Save Transaction"}
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
