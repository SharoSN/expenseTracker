// TransactionModal.tsx
import BackButton from "@/components/BackButton";
import HeaderBox from "@/components/HeaderBox";
import TransactionDatePicker from "@/components/TransactionDatePicker";
import TransactionForm from "@/components/TransactionForm";
import WalletDropdownComponent from "@/components/WalletDropdown";
import icons from "@/constants/icons";
import { useFetchData } from "@/hooks/useFetchData";
import {
  createOrUpdateTransaction,
  handleDeleteTransaction,
  pickDocument,
  removeTransactionReceipt,
  uploadReceipt
} from "@/lib/appwrite";
import { useGlobalContext } from "@/lib/global-provider";
import { TransactionType } from "@/types";
import { Input } from "@/~/components/ui/input";
import { BlurView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
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

const TransactionModal = () => {
  const { user, refetch } = useGlobalContext();
  const params = useLocalSearchParams();
  const router = useRouter();

  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const { wallets } = useFetchData(user?.$id as string);

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
    image: null // This should store the Appwrite file ID
  });

  useEffect(() => {
    if (params?.id) {
      const oldTransaction = params as any;
      console.log("Image param received in modal:", oldTransaction.image); // Still useful for debugging

      // Set the transaction data, keeping 'image' as the Appwrite file ID.
      // We need to parse the file ID from the URL that Transactionslist passed.
      let existingImageFileId: string | null = null;
      if (oldTransaction.image) {
        // Extract the file ID from the full URL.
        // The URL format is typically:
        // .../buckets/{bucketId}/files/{fileId}/preview?...
        const parts = oldTransaction.image.split("/");
        const fileIdIndex = parts.findIndex((part) => part === "files") + 1;
        if (fileIdIndex > 0 && fileIdIndex < parts.length) {
          existingImageFileId = parts[fileIdIndex];
        }
      }

      setTransaction({
        type: oldTransaction.type,
        amount: Number(oldTransaction.amount),
        amountText: String(oldTransaction.amount),
        description: oldTransaction.description || "",
        category: oldTransaction.category || "",
        date: new Date(oldTransaction.date),
        walletId: oldTransaction.walletId,
        image: existingImageFileId, // Store the Appwrite File ID here
        newImageFile: null
      });
      setSelectedWalletId(oldTransaction.walletId);

      // Set the receiptImageUri for display using the full URL from params
      if (oldTransaction.image) {
        setReceiptImageUri(oldTransaction.image); // This is the full URL for display
      } else {
        setReceiptImageUri(null);
      }
    }
  }, [params?.id, params?.image]);

  const handleUpload = useCallback(async () => {
    const pickedFile = await pickDocument();
    if (!pickedFile) return;

    // Set for immediate preview (local URI)
    setReceiptImageUri(pickedFile.uri);
    // Store the file object to be uploaded with the transaction
    setTransaction((prev) => ({
      ...prev,
      newImageFile: pickedFile,
      image: null
    })); // Clear existing image ID if new one selected
  }, []);

  const handleRemoveReceipt = async () => {
    try {
      if (!params?.id) {
        Alert.alert("Error", "No transaction ID found");
        return;
      }

      const result = await removeTransactionReceipt(params.id as string);

      if (!result.success) {
        Alert.alert("Error", result.msg || "Failed to remove receipt image");
        return;
      }

      Alert.alert("Success", "Receipt image removed successfully!");
      setReceiptImageUri(null);
      setTransaction((prev) => ({ ...prev, image: null }));
      // Optional: update your UI state here so the transaction no longer shows a receipt
    } catch (error) {
      Alert.alert("Error", "Something went wrong while removing receipt");
    }
  };

  const handleDelete = useCallback(() => {
    if (!params?.id) return;

    Alert.alert(
      "Delete Transaction",
      "Are you sure you want to delete this transaction?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const success = await handleDeleteTransaction(
                params.id as string
              );
              if (success) {
                Alert.alert("Deleted", "Transaction has been deleted");

                // ✅ Refresh wallet transactions and total balance
                refetch && (await refetch());

                router.back();
              } else {
                Alert.alert("Error", "Failed to delete transaction");
              }
            } catch (err) {
              console.error("Delete error:", err);
              Alert.alert("Error", "Something went wrong");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }, [params?.id, refetch, router]);

  const [loading, setLoading] = useState(false);

  const handleSaveTransaction = useCallback(async () => {
    const {
      type,
      amount,
      description,
      date,
      category,
      walletId,
      image,
      newImageFile
    } = transaction;

    if (
      !walletId ||
      !date ||
      !amount ||
      amount <= 0 ||
      (type === "expense" && !category)
    ) {
      Alert.alert(
        "Transaction",
        "Please fill all the required fields correctly"
      );
      return;
    }

    setLoading(true);

    let finalImageId = image; // Start with the existing image ID (which should be the Appwrite File ID)

    // If a new image file was selected, upload it
    if (newImageFile) {
      try {
        const uploadedFile = await uploadReceipt(newImageFile);
        if (uploadedFile && uploadedFile.$id) {
          finalImageId = uploadedFile.$id; // Store the Appwrite file ID
        } else {
          Alert.alert("Error", "Failed to upload receipt image.");
          setLoading(false);
          return;
        }
      } catch (uploadError) {
        console.error("Error uploading image:", uploadError);
        Alert.alert("Error", "Failed to upload receipt image.");
        setLoading(false);
        return;
      }
    } else if (receiptImageUri === null && image !== null) {
      // User removed an existing image, and no new one was picked
      // This ensures the image field is set to null in the database
      finalImageId = null;
    }

    const transactionData: Partial<TransactionType> = {
      id: params?.id,
      type,
      amount,
      description,
      category,
      date,
      walletId,
      image: finalImageId // Pass the Appwrite file ID here
    };

    try {
      const result = await createOrUpdateTransaction(transactionData);

      if (!result.success) {
        Alert.alert("Error", result.msg || "Failed to save transaction");
        setLoading(false);
        return;
      }

      Alert.alert(
        "Success",
        params?.id ? "Transaction updated" : "Transaction added"
      );
      refetch && refetch();
      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [transaction, params?.id, refetch, router, receiptImageUri]); // Added receiptImageUri to dependencies

  const onSelectWallet = useCallback((id: string) => {
    setSelectedWalletId(id);
    setTransaction((prev) => ({ ...prev, walletId: id }));
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <BlurView intensity={100} tint="light" style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View className="flex-1 px-10 pt-6">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <BackButton />

              <HeaderBox
                type="greeting"
                title={params?.id ? "Update Transaction" : "Transaction"}
                subtext={params?.id ? "Edit Transaction" : "Add Transaction"}
              />

              {params?.id ? (
                <TouchableOpacity onPress={handleDelete} disabled={loading}>
                  <Image
                    source={icons.deleteIcon}
                    className="w-6 h-6"
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} /> // placeholder to balance layout
              )}
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1 }}
              className="w-full"
              showsVerticalScrollIndicator={false}
            >
              <View className="flex flex-col w-full">
                <TransactionForm
                  transaction={transaction}
                  setTransaction={setTransaction}
                />

                <View className="mt-8 flex flex-col w-full">
                  <Text className="text-lg font-medium text-gray-700">
                    Wallets
                  </Text>
                  <WalletDropdownComponent
                    wallets={wallets}
                    selectedWalletId={selectedWalletId as string}
                    onSelectWallet={onSelectWallet}
                  />
                </View>

                <View className="mt-8 flex flex-col w-full">
                  <Text className="text-lg font-medium text-gray-700">
                    Date
                  </Text>
                  <TransactionDatePicker
                    transaction={transaction}
                    setTransaction={setTransaction}
                  />
                </View>

                <View className="flex flex-col w-full mt-6">
                  <Text className="text-lg font-medium text-gray-700 mb-1">
                    Amount
                  </Text>
                  <Input
                    keyboardType="numeric"
                    value={transaction.amountText}
                    onChangeText={(value) => {
                      const numericRegex = /^\d*\.?\d*$/;
                      if (numericRegex.test(value)) {
                        setTransaction((prev) => ({
                          ...prev,
                          amountText: value,
                          amount: parseFloat(value) || 0
                        }));
                      }
                    }}
                    placeholder="0.00"
                    placeholderTextColor={"#555555"}
                    autoCapitalize="none"
                    className="border border-gray-500 rounded-lg w-full p-4 mt-3"
                    editable={!loading}
                  />
                </View>

                <View className="flex flex-col w-full mt-6">
                  <View className="flex flex-row gap-2 items-baseline mb-1">
                    <Text className="text-lg font-medium text-gray-700">
                      Description
                    </Text>
                    <Text className="text-base font-medium text-gray-400">
                      (optional)
                    </Text>
                  </View>
                  <Input
                    value={transaction.description}
                    onChangeText={(value) =>
                      setTransaction((prev) => ({
                        ...prev,
                        description: value
                      }))
                    }
                    placeholderTextColor={"#555555"}
                    placeholder="E.g. Grocery shopping, Rent, Coffee"
                    autoCapitalize="none"
                    className="border border-gray-500 rounded-lg w-full h-20 px-4 py-3 mt-3 text-base"
                    editable={!loading}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                {/* Receipt Upload */}
                <View className="flex flex-col w-full mt-6">
                  <View className="flex flex-row gap-2 items-baseline mb-1">
                    <Text className="text-lg font-medium text-gray-700">
                      Receipt
                    </Text>
                    <Text className="text-base font-medium text-gray-400">
                      (optional)
                    </Text>
                  </View>

                  {receiptImageUri && (
                    <View className="mb-2 self-start">
                      <View className="relative mb-3">
                        <Image
                          source={{ uri: receiptImageUri }}
                          className="w-24 h-24 rounded-full border border-gray-300"
                        />
                        <TouchableOpacity
                          onPress={handleRemoveReceipt}
                          style={{
                            position: "absolute",
                            top: -8,
                            right: -8,
                            backgroundColor: "white",
                            borderRadius: 12,
                            padding: 2
                          }}
                          disabled={loading}
                        >
                          <Image source={icons.remove} className="w-6 h-6" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleUpload}
                    className="w-full rounded-lg border border-gray-600 p-4 bg-black-1 mt-4"
                    disabled={loading}
                  >
                    <View className="flex-row items-center gap-2 justify-center">
                      <Image
                        source={icons.upload}
                        className="w-6 h-6"
                        style={{ tintColor: "white" }}
                      />
                      <Text className="text-white text-center font-medium text-lg">
                        Upload Image
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Save Button */}
            <View className="gap-4 mt-6">
              <View
                className="h-[2px] bg-gray-200 mx-6 my-5 rounded-full"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 5,
                  elevation: 3
                }}
              />
              <TouchableOpacity
                onPress={handleSaveTransaction}
                disabled={loading}
                className={`w-full rounded-lg border border-gray-600 p-3 ${
                  loading ? "bg-gray-400" : "bg-black-1"
                }`}
              >
                <Text className="text-white text-center font-medium text-lg">
                  {params?.id ? "Update Transaction" : "Save Transaction"}
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
