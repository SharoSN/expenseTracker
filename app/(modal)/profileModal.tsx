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
  updateName,
  updateEmail,
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
  const [updatedEmail, setUpdatedEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showEmailSection, setShowEmailSection] = useState(false);

  const router = useRouter();

  const imageUrl = user?.avatarUrl
    ? user.avatarUrl
    : avatarURL.getInitials(
        `${user?.firstName || ""} ${user?.lastName || ""}`,
        100,
        100
      ).href;

  const handleUpload = async () => {
    if (!user?.$id) {
      Alert.alert("Error", "You must be logged in to update your avatar.");
      return;
    }

    try {
      const file = await pickDocument();
      if (!file) return;

      const avatarUrl = await uploadAvatar(file);
      if (!avatarUrl) {
        Alert.alert("Error", "Failed to upload avatar.");
        return;
      }

      await updateUserAvatar(user.$id, avatarUrl);
      await refetch();
      Alert.alert("Success", "Avatar updated successfully!");
    } catch (error) {
      console.error("Avatar upload process failed:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred during avatar update."
      );
    }
  };

  const handleUpdateProfile = async () => {
    if (!updatedFirstName && !updatedLastName) {
      Alert.alert("Error", "Please enter a new name to update your profile.");
      return;
    }

    const newFirstName = updatedFirstName || user?.firstName;
    const newLastName = updatedLastName || user?.lastName;

    if (!newFirstName || !newLastName) {
      Alert.alert("Error", "First and last name cannot be empty.");
      return;
    }

    try {
      const nameUpdated = await updateName({
        userId: user?.$id,
        firstName: newFirstName,
        lastName: newLastName
      });

      if (nameUpdated) {
        Alert.alert("Success", "Profile updated successfully");
        await refetch();
        router.back();
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("Error", "An error occurred while updating your profile.");
    }
  };

  const handleUpdateEmail = async () => {
    if (!updatedEmail) {
      Alert.alert("Error", "Please enter a new email address.");
      return;
    }

    if (!currentPassword) {
      Alert.alert(
        "Error",
        "Please enter your current password to update email."
      );
      return;
    }

    try {
      const result = await updateEmail({
        userId: user?.$id,
        newEmail: updatedEmail,
        password: currentPassword
      });

      if (result.success) {
        Alert.alert("Success", "Email updated successfully!");
        setUpdatedEmail("");
        setCurrentPassword("");
        setShowEmailSection(false);
        await refetch();
      } else {
        Alert.alert("Error", result.msg || "Failed to update email.");
      }
    } catch (error) {
      console.error("Error updating email:", error);
      Alert.alert("Error", "An error occurred while updating your email.");
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
              {/* Avatar */}
              <View className="items-center justify-center mt-5">
                <View className="relative w-44 h-44 bg-gray-100 rounded-full overflow-hidden">
                  <Image
                    source={{ uri: imageUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                  {/*Future update: avatar upload <TouchableOpacity
                    onPress={handleUpload}
                    className="absolute bottom-6 right-6 bg-white p-1 rounded-full shadow"
                  >
                    <Image source={icons.edit} className="size-5" />
                  </TouchableOpacity> */}
                </View>
              </View>

              {/* Name Fields */}
              <View className="flex flex-col w-full mt-6">
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  First Name
                </Text>
                <Input
                  value={updatedFirstName}
                  onChangeText={setUpdatedFirstName}
                  placeholder={user?.firstName || "Enter your new first name"}
                  autoCapitalize="none"
                  className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 h-16"
                />

                <Text className="text-sm font-medium text-gray-700 mb-1 mt-4">
                  Last Name
                </Text>
                <Input
                  value={updatedLastName}
                  onChangeText={setUpdatedLastName}
                  placeholder={user?.lastName || "Enter your new last name"}
                  autoCapitalize="none"
                  className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 h-16"
                />
              </View>

              {/* Update Name Button */}
              <TouchableOpacity
                onPress={handleUpdateProfile}
                className="w-full bg-black-1 text-white rounded-lg border border-gray-600 p-4 mt-6"
              >
                <Text className="text-white text-center text-lg font-semibold">
                  Update Name
                </Text>
              </TouchableOpacity>

              {/* Divider */}
              <View className="flex-row items-center my-6">
                <View className="flex-1 h-px bg-gray-200" />
                <Text className="mx-4 text-gray-400 text-sm">Email</Text>
                <View className="flex-1 h-px bg-gray-200" />
              </View>

              {/* Current Email Display */}
              <View className="flex-row items-center justify-between mb-4">
                <View>
                  <Text className="text-sm text-gray-500">Current Email</Text>
                  <Text className="text-base font-medium text-gray-800">
                    {user?.email || "No email set"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowEmailSection(!showEmailSection)}
                  className="bg-gray-100 px-4 py-2 rounded-lg"
                >
                  <Text className="text-sm font-medium text-gray-700">
                    {showEmailSection ? "Cancel" : "Change"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Email Update Section */}
              {showEmailSection && (
                <View className="flex flex-col w-full">
                  <Text className="text-sm font-medium text-gray-700 mb-1">
                    New Email
                  </Text>
                  <Input
                    value={updatedEmail}
                    onChangeText={setUpdatedEmail}
                    placeholder="Enter your new email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 h-16"
                  />

                  <Text className="text-sm font-medium text-gray-700 mb-1 mt-4">
                    Current Password
                  </Text>
                  <Input
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter your current password"
                    secureTextEntry
                    className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 h-16"
                  />

                  <Text className="text-xs text-gray-400 mt-2 mb-4">
                    Your password is required to update your email address.
                  </Text>

                  <TouchableOpacity
                    onPress={handleUpdateEmail}
                    className="w-full bg-black-1 rounded-lg border border-gray-600 p-4"
                  >
                    <Text className="text-white text-center text-lg font-semibold">
                      Update Email
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </BlurView>
    </SafeAreaView>
  );
};

export default ProfileModal;
