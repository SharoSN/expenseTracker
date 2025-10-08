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
  pickDocument,
  uploadAvatar,
  deleteUserWalletWithImage,
  removeWalletIcon
} from "@/lib/appwrite";
import { useGlobalContext } from "@/lib/global-provider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BlurView } from "expo-blur";

const WalletModal = () => {
  const { user, refetch } = useGlobalContext();
  const params = useLocalSearchParams();
  const router = useRouter();

  const [walletIconUri, setWalletIconUri] = useState<string | null>(null);
  const [walletName, setWalletName] = useState("");
  const [walletIconFile, setWalletIconFile] = useState<{
    name: string;
    type: string;
    size: number;
    uri: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);

  // Run only once to set initial state
  useEffect(() => {
    if (params?.id) {
      setWalletName(params.name || "");
      setWalletIconUri((params.image as string) || null);
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
      let imageUrl = walletIconUri;

      if (walletIconFile) {
        const uploadedImageUrl = await uploadAvatar(walletIconFile);
        if (!uploadedImageUrl) {
          alert("Failed to upload image.");
          setLoading(false);
          return;
        }
        imageUrl = uploadedImageUrl;
      }

      const newOrUpdatedWallet = await createUpdateWallet({
        userId: user?.$id,
        name: walletName,
        imageUrl,
        walletId: params?.id || undefined
      });

      if (!newOrUpdatedWallet) {
        alert("Failed to save wallet.");
        setLoading(false);
        return;
      }

      alert(params?.id ? "✅ Wallet updated!" : "✅ Wallet created!");
      refetch?.();
      router.back();
    } catch (error: any) {
      console.error("Error saving wallet:", error?.message, error);
      alert("An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveWalletIcon = async () => {
    try {
      if (!params?.id) {
        Alert.alert("Error", "No wallet ID found");
        return;
      }
      const result = await removeWalletIcon(params.id as string);
      if (!result?.success) {
        Alert.alert("Error", result.msg || "Failed to remove wallet icon");
        return;
      }
      Alert.alert("Success", "Wallet icon removed successfully!");
      setWalletIconUri(null);
      setWalletIconFile(null);
    } catch (error) {
      Alert.alert("Error", "Something went wrong while removing wallet icon");
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
                alert("Failed to delete wallet and image");
              }
            } catch (error) {
              console.error("Error deleting wallet and image:", error);
              alert("An error occurred while deleting wallet and image.");
            } finally {
              setLoading(false);
            }
          }
        }
      ],
      { cancelable: false }
    );
  };

  const handleUpload = async () => {
    if (loading) return;

    const walletIcon = await pickDocument();
    if (!walletIcon) return;

    setWalletIconUri(walletIcon.uri);
    setWalletIconFile(walletIcon);
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
                  placeholder=""
                  autoCapitalize="none"
                  className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3"
                  editable={!loading}
                />

                <Text className="text-lg font-medium text-gray-700 mt-2 mb-1">
                  Wallet Icon
                </Text>

                {walletIconUri ? (
                  <View className="mb-2 self-start">
                    <View className="relative mb-3">
                      <Image
                        source={{ uri: walletIconUri }}
                        className="w-24 h-24 rounded-full border border-gray-300"
                      />

                      <TouchableOpacity
                        onPress={handleRemoveWalletIcon}
                        style={{
                          position: "absolute",
                          top: -8,
                          right: -8,
                          borderRadius: 12,
                          padding: 2
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        disabled={loading}
                      >
                        <Image source={icons.remove} className="size-6" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text className="text-gray-500">No wallet icon</Text>
                )}
              </View>
            </ScrollView>

            {/* Bottom Buttons */}
            <View className="gap-4 mt-6">
              <TouchableOpacity
                className="border border-gray-300 p-3 rounded-lg bg-black-1"
                onPress={handleUpload}
                disabled={loading}
              >
                <View className="flex flex-row w-full justify-center items-center gap-1">
                  <Image
                    source={icons.upload}
                    className="size-6"
                    style={{ tintColor: "white" }}
                  />
                  <Text className="text-xl text-center text-white">
                    {walletIconUri ? "Change Image" : "Upload Image"}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveWallet}
                disabled={loading}
                className={`w-full rounded-lg border border-gray-600 p-3 ${
                  loading ? "bg-gray-400" : "bg-black-1"
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
