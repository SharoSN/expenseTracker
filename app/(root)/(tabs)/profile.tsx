import {
  Image,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert
} from "react-native";
import React, { useEffect } from "react";
import icons from "@/constants/icons";
import { useGlobalContext } from "@/lib/global-provider";
import { settings } from "@/constants/data";
import { avatar } from "@/lib/appwrite";
import { useRouter } from "expo-router";
import { useAppSocket } from "@/hooks/useAppSocket";

interface SettingsItemProp {
  icon: any;
  title: string;
  onPress?: () => void;
  textStyle?: string;
  showArrow?: boolean;
  isDestructive?: boolean;
}

const SettingsItem = ({
  icon,
  title,
  onPress,
  textStyle,
  showArrow = true,
  isDestructive = false,
}: SettingsItemProp) => (
  <TouchableOpacity
    onPress={onPress}
    className="flex flex-row items-center justify-between px-6 py-4"
  >
    <View className="flex flex-row items-center gap-3">
      <Image source={icon} className="size-6" />
      <Text className={`text-base font-rubik-medium ${isDestructive ? "text-red-600" : "text-black-300"} ${textStyle}`}>
        {title}
      </Text>
    </View>
    {showArrow && <Image source={icons.rightArrow} className="size-5" />}
  </TouchableOpacity>
);

const SectionHeader = ({ title }: { title: string }) => (
  <View className="mt-8 mb-3 px-6">
    <Text className="text-sm font-rubik-bold text-gray-600 uppercase tracking-wider">
      {title}
    </Text>
  </View>
);

const SectionContainer = ({ children }: { children: React.ReactNode }) => (
  <View className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
    {children}
  </View>
);

const Divider = () => <View className="h-px bg-gray-200" />;

const Profile = () => {
  const router = useRouter();
  const { user, refetch, logoutUser } = useGlobalContext();
  const { remainingAllowance, checkRemainingAllowance, isConnected } = useAppSocket(user?.$id);

  // Check allowance only when WebSocket is connected
  useEffect(() => {
    if (user?.$id && isConnected) {
      checkRemainingAllowance();
    }
  }, [user?.$id, isConnected]);

  const handlePress = () => {
    router.push("/profileModal");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // TODO: Implement delete account logic
            Alert.alert("Account Deletion", "Account deletion feature coming soon.");
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            const success = await logoutUser();
            if (success) {
              refetch();
            } else {
              Alert.alert("Error", "An error occurred while signing out");
            }
          },
        },
      ]
    );
  };

  const profileSettings = settings.map((item) => {
    if (item.title === "Edit Profile") {
      return { ...item, onPress: handlePress };
    }
    return item;
  });

  const imageUrl = user?.avatarUrl
    ? user.avatarUrl
    : avatar.getInitials(
      `${user?.firstName || ""} ${user?.lastName || ""}`,
      200,
      200
    ).href;

  const getAllowanceDisplay = () => {
    if (!remainingAllowance) return "Loading...";

    if (remainingAllowance.limit === -1) {
      return "Unlimited";
    }

    return `${remainingAllowance.remaining} / ${remainingAllowance.limit}`;
  };

  const getAllowanceColor = () => {
    if (!remainingAllowance || remainingAllowance.limit === -1) return "text-black-1";

    const percentage = (remainingAllowance.remaining / remainingAllowance.limit) * 100;

    if (percentage > 50) return "text-blue-900";
    if (percentage > 20) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <SafeAreaView className="h-full bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-32"
      >
        {/* Profile Header */}
        <View className="flex items-center mt-5 px-6">
          <Text className="text-3xl font-rubik-bold">Profile</Text>
        </View>

        {/* User Avatar and Name */}
        <View className="flex flex-row justify-center mt-6 px-6">
          <View className="flex flex-col items-center">
            <View className="size-44 rounded-full border-2 border-blue-200 overflow-hidden bg-gray-100 shadow-md">
              <Image
                source={{ uri: imageUrl }}
                className="w-full h-full"
                resizeMode="cover"
              />
            </View>
            <Text className="text-2xl font-rubik-bold text-black-1 mt-4">
              {user?.firstName} {user?.lastName}
            </Text>
            <Text className="text-sm text-gray-600 mt-1">
              {user?.email}
            </Text>
          </View>
        </View>

        {/* AI Allowance Card */}
        {isConnected && (
          <View className="mt-8 mx-6 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl border border-blue-200 shadow-sm">
            <View className="flex flex-row items-center justify-between mb-2">
              <Text className="text-lg font-rubik-semibold text-blue-900">
                AI Chat Allowance
              </Text>
            </View>

            <View className="flex flex-row items-center justify-between mt-3">
              <Text className="text-sm font-rubik text-blue-800">
                Daily Limit
              </Text>
              <Text className={`text-2xl font-rubik-bold ${getAllowanceColor()}`}>
                {getAllowanceDisplay()}
              </Text>
            </View>

            {remainingAllowance && remainingAllowance.limit !== -1 && (
              <>
                <View className="mt-4 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <View
                    className={`h-full ${(remainingAllowance.remaining / remainingAllowance.limit) * 100 > 50
                      ? "bg-green-500"
                      : (remainingAllowance.remaining / remainingAllowance.limit) * 100 > 20
                        ? "bg-yellow-500"
                        : "bg-red-500"
                      }`}
                    style={{
                      width: `${Math.max(
                        5,
                        (remainingAllowance.remaining / remainingAllowance.limit) * 100
                      )}%`,
                    }}
                  />
                </View>

                <Text className="text-xs text-blue-700 mt-3">
                  ℹ️ Manual transactions are unlimited. AI interactions reset daily at midnight.
                </Text>
              </>
            )}

            {remainingAllowance && remainingAllowance.limit === -1 && (
              <Text className="text-sm text-green-700 mt-3 font-rubik-medium">
                ✨ You have unlimited AI interactions!
              </Text>
            )}
          </View>
        )}

        {/* Settings Section */}
        <SectionHeader title="Account Settings" />
        <View className="mx-6">
          <SectionContainer>
            {profileSettings.slice(2).map((item, index) => (
              <View key={index}>
                <SettingsItem {...item} />
                {index < profileSettings.slice(2).length - 1 && <Divider />}
              </View>
            ))}
          </SectionContainer>
        </View>

        {/* About App Section */}
        <SectionHeader title="About App" />
        <View className="mx-6">
          <SectionContainer>
            <SettingsItem

              icon={icons.info}
              title="FAQ"
              onPress={() => {
                Alert.alert("FAQ", "FAQ page coming soon");
              }}
              showArrow={true}
            />
            <Divider />
            <SettingsItem
              icon={icons.shield}
              title="Privacy Policy"
              onPress={() => {
                Alert.alert("Privacy Policy", "Privacy policy page coming soon");
              }}
              showArrow={true}
            />
            <Divider />
            <SettingsItem
              icon={icons.info}
              title="Terms of Service"
              onPress={() => {
                Alert.alert("Terms of Service", "Terms of service page coming soon");
              }}
              showArrow={true}
            />
          </SectionContainer>
        </View>

        {/* Actions Section */}
        <SectionHeader title="Actions" />
        <View className="mx-6">
          <SectionContainer>
            <SettingsItem
              icon={icons.logout}
              title="Sign Out"
              onPress={handleLogout}
              isDestructive={true}
              showArrow={false}
            />
            <Divider />
            <SettingsItem
              icon={icons.deleteIcon}
              title="Delete Account"
              onPress={handleDeleteAccount}
              isDestructive={true}
              showArrow={false}
            />
          </SectionContainer>
        </View>

        {/* App Version Footer */}
        <View className="mt-12 mb-6 items-center">
          <Text className="text-xs text-gray-500">
            Velora v1.0.0
          </Text>
          <Text className="text-xs text-gray-400 mt-1">
            © 2025 Velora. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;
