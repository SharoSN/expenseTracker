import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert
} from "react-native";
import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native";
import HeaderBox from "@/components/HeaderBox";
import BackButton from "@/components/BackButton";
import { Input } from "@/~/components/ui/input";
import icons from "@/constants/icons";
import {
  createUpdateWallet,
  deleteUserWalletWithImage,
} from "@/lib/appwrite";
import { useGlobalContext } from "@/lib/global-provider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { walletIcons } from "@/constants/data";

const WalletModal = () => {
  const { user, refetch } = useGlobalContext();
  const params = useLocalSearchParams();
  const router = useRouter();

  const [selectedIconIndex, setSelectedIconIndex] = useState<number>(0);
  const [walletName, setWalletName] = useState("");
  const [loading, setLoading] = useState(false);

  // Run only once to set initial state
  useEffect(() => {
    console.log("📋 Params received:", params);

    if (params?.id) {
      setWalletName(params.name || "");

      // Extract icon index from the image parameter
      const imageParam = params.image as string;
      console.log("🖼️ Image param:", imageParam);

      if (imageParam?.startsWith('icon-')) {
        const iconIndex = parseInt(imageParam.replace('icon-', ''));
        console.log("🔢 Extracted icon index:", iconIndex);

        if (!isNaN(iconIndex) && iconIndex >= 0 && iconIndex < walletIcons.length) {
          setSelectedIconIndex(iconIndex);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveWallet = async () => {
    if (loading) return;

    if (!walletName) {
      alert("Please enter a wallet name.");
      return;
    }

    setLoading(true);
    try {
      // Save the icon index as "icon-0", "icon-1", etc.
      const imageUrl = `icon-${selectedIconIndex}`;

      console.log("💾 Saving wallet with:");
      console.log("  - Name:", walletName);
      console.log("  - ImageUrl:", imageUrl);
      console.log("  - WalletId:", params?.id || "NEW");
      console.log("  - UserId:", user?.$id);

      const newOrUpdatedWallet = await createUpdateWallet({
        userId: user?.$id,
        name: walletName,
        imageUrl,
        walletId: params?.id || undefined
      });

      console.log("✅ Wallet saved:", newOrUpdatedWallet);

      if (!newOrUpdatedWallet) {
        alert("Failed to save wallet.");
        setLoading(false);
        return;
      }

      alert(params?.id ? "✅ Wallet updated!" : "✅ Wallet created!");
      refetch?.();
      router.back();
    } catch (error: any) {
      console.error("❌ Error saving wallet:", error?.message, error);
      alert("An error occurred: " + error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWallet = (walletId: string) => {
    if (loading) return;

    Alert.alert(
      "Delete Wallet",
      "Are you sure you want to delete this wallet? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const deleted = await deleteUserWalletWithImage(walletId);
              if (deleted) {
                alert("Wallet deleted successfully");
                refetch?.();
                router.back();
              } else {
                alert("Failed to delete wallet");
              }
            } catch (error) {
              console.error("Error deleting wallet:", error);
              alert("An error occurred while deleting wallet.");
            } finally {
              setLoading(false);
            }
          }
        }
      ],
      { cancelable: false }
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <BlurView intensity={50} tint="light" style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View className="flex-1 p-10">
            {/* Header */}
            <View className="flex flex-row gap-24 items-end">
              <BackButton />
              <HeaderBox
                type="greeting"
                title={params?.id ? "Edit Wallet" : "New Wallet"}
                subtext={params?.id ? "Update your wallet" : "Add a new Wallet"}
              />

              {params?.id && (
                <TouchableOpacity
                  onPress={() => handleDeleteWallet(params.id as string)}
                  disabled={loading}
                  style={{ padding: 8 }}
                >
                  <Image source={icons.deleteIcon} className="size-8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Scrollable content */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1 }}
              className="w-full max-w-md"
            >
              <View className="flex flex-col w-full mt-8">
                <Text className="text-lg font-medium text-gray-700 mb-1">
                  Wallet Name
                </Text>
                <Input
                  value={walletName}
                  onChangeText={setWalletName}
                  placeholder="Enter wallet name"
                  autoCapitalize="none"
                  className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 h-14"
                  editable={!loading}
                />

                <Text className="text-lg font-medium text-gray-700 mt-6 mb-3">
                  Select Wallet Icon
                </Text>

                {/* Debug info */}
                <Text className="text-sm text-gray-500 mb-2">
                  Currently selected: icon-{selectedIconIndex}
                </Text>

                <View className="flex-row flex-wrap gap-4 mt-3">
                  {walletIcons.map((item, index) => {
                    const isSelected = selectedIconIndex === index;

                    return (
                      <TouchableOpacity
                        key={index}
                        onPress={() => {
                          console.log("🎯 Icon clicked:", index);
                          setSelectedIconIndex(index);
                        }}
                        className={`p-2 rounded-xl border-2 ${isSelected ? "border-black bg-gray-100" : "border-gray-300"
                          }`}
                      >
                        <Image
                          source={item.icon}
                          className="w-12 h-12"
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Save Button */}
            <View className="gap-4 mt-6">
              <TouchableOpacity
                onPress={handleSaveWallet}
                disabled={loading}
                className={`w-full rounded-lg border border-gray-600 p-3 ${loading ? "bg-gray-400" : "bg-black-1"
                  }`}
              >
                <Text className="text-white text-center text-xl">
                  {loading
                    ? "Saving..."
                    : params?.id
                      ? "Update Wallet"
                      : "Add Wallet"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </SafeAreaView>
  );
};

export default WalletModal;
