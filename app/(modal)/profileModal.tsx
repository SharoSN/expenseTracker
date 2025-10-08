import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert
} from "react-native";
import React, { useState } from "react";
import { SafeAreaView } from "react-native";
import BackButton from "@/components/BackButton";
import HeaderBox from "@/components/HeaderBox";
import { useGlobalContext } from "@/lib/global-provider";
import icons from "@/constants/icons";
import { Input } from "@/~/components/ui/input";
import {
  avatar,
  pickDocument,
  updateName,
  updateUserAvatar,
  uploadAvatar
} from "@/lib/appwrite";
import { useRouter } from "expo-router";
import { BlurView } from "expo-blur";

const ProfileModal = () => {
  const avatarURL = avatar;
  const { user, refetch } = useGlobalContext();
  const [updatedFirstName, setUpdatedFirstName] = useState("");
  const [updatedLastName, setUpdatedLastName] = useState("");

  const router = useRouter();

  // Use uploaded avatar if exists, otherwise fallback to initials
  const imageUrl = user?.avatarUrl
    ? user.avatarUrl
    : avatarURL.getInitials(
        `${user?.firstName || ""} ${user?.lastName || ""}`,
        100,
        100
      ).href;

  const handleUpload = async () => {
    console.log("Starting avatar upload process. User ID:", user?.$id);

    // Check if user is logged in
    if (!user?.$id) {
      Alert.alert("Error", "You must be logged in to update your avatar.");
      return;
    }

    try {
      // Pick the document from the device
      const file = await pickDocument();
      if (!file) return;

      console.log("File picked successfully.");

      // Upload the file to Appwrite storage
      const avatarUrl = await uploadAvatar(file);
      if (!avatarUrl) {
        Alert.alert("Error", "Failed to upload avatar.");
        return;
      }

      console.log("Avatar uploaded. URL:", avatarUrl);

      // Update the user document in the database
      await updateUserAvatar(user.$id, avatarUrl);

      console.log("User document updated in database. Now refetching.");

      // Await the refetch to ensure the global state is updated
      await refetch();

      console.log("Refetch completed. Avatar update successful!");

      Alert.alert("Success", "Avatar updated successfully!");
    } catch (error) {
      console.error("Avatar upload process failed:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred during avatar update."
      );
    }
  };

  // Inside your ProfileModal component

  // Inside your ProfileModal component

  const handleUpdateProfile = async () => {
    // 1. Check if the input fields are not empty.
    if (!updatedFirstName && !updatedLastName) {
      Alert.alert("Error", "Please enter a new name to update your profile.");
      return;
    }

    // 2. You might want to get the existing name to avoid clearing it
    const newFirstName = updatedFirstName || user?.firstName;
    const newLastName = updatedLastName || user?.lastName;

    if (!newFirstName || !newLastName) {
      Alert.alert("Error", "First and last name cannot be empty.");
      return;
    }

    try {
      // 3. Call the updateName function with the new values
      const nameUpdated = await updateName({
        userId: user?.$id,
        firstName: newFirstName,
        lastName: newLastName
      });

      if (nameUpdated) {
        Alert.alert("Success", "Profile updated successfully");
        await refetch(); // Await the refetch to ensure the UI updates
        router.back();
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("Error", "An error occurred while updating your profile.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <BlurView intensity={30} tint="light" style={{ flex: 1 }}>
        <View className="p-10 flex-1">
          <View className="flex flex-row gap-24 items-center mb-2">
            <BackButton />
            <HeaderBox
              type="greeting"
              title="Profile"
              subtext="Update your Profile"
            />
          </View>

          <View className="flex-1 justify-between">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <View className="items-center justify-center mt-5">
                <View className="relative w-44 h-44 bg-gray-100 rounded-full overflow-hidden">
                  <Image
                    source={{ uri: imageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />

                  <TouchableOpacity
                    onPress={handleUpload}
                    className="absolute bottom-6 right-6 bg-white p-1 rounded-full shadow"
                  >
                    <Image source={icons.edit} className="size-5" />
                  </TouchableOpacity>
                </View>
              </View>

              <View className="flex flex-col w-full mt-6">
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  First Name
                </Text>
                <Input
                  value={updatedFirstName}
                  onChangeText={setUpdatedFirstName}
                  placeholder="Enter your new first name"
                  autoCapitalize="none"
                  className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3"
                />

                <Text className="text-sm font-medium text-gray-700 mb-1 mt-4">
                  Last Name
                </Text>
                <Input
                  value={updatedLastName}
                  onChangeText={setUpdatedLastName}
                  placeholder="Enter your new last name"
                  autoCapitalize="none"
                  className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={handleUpdateProfile}
              className="w-full bg-black-1 text-white rounded-lg border border-gray-600 p-4"
            >
              <Text className="text-white text-center text-2xl">Update</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </SafeAreaView>
  );
};

export default ProfileModal;
