import {
  Image,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert
} from "react-native";
import React from "react";
import icons from "@/constants/icons";
import { useGlobalContext } from "@/lib/global-provider";
import { settings } from "@/constants/data";
import { avatar } from "@/lib/appwrite";
import { useRouter } from "expo-router";

interface SettingsItemProp {
  icon: any;
  title: string;
  onPress?: () => void;
  textStyle?: string;
  showArrow?: boolean;
}

const SettingsItem = ({
  icon,
  title,
  onPress,
  textStyle,
  showArrow = true
}: SettingsItemProp) => (
  <TouchableOpacity
    onPress={onPress}
    className="flex flex-row items-center justify-between px-6 mt-12"
  >
    <View className="flex flex-row items-center gap-3">
      <Image source={icon} className="size-7" />
      <Text className={`text-lg font-rubik-medium text-black-300 ${textStyle}`}>
        {title}
      </Text>
    </View>

    {showArrow && <Image source={icons.rightArrow} className="size-5" />}
  </TouchableOpacity>
);

const Profile = () => {
  const router = useRouter();
  const { user, refetch, logoutUser } = useGlobalContext();

  const handlePress = () => {
    router.push("/profileModal");
  };

  const profileSettings = settings.map((item) => {
    if (item.title === "Edit Profile") {
      return { ...item, onPress: handlePress };
    }
    return item;
  });

  // Use uploaded avatar if exists, otherwise fallback to initials URL with .href
  const imageUrl = user?.avatarUrl
    ? user.avatarUrl
    : avatar.getInitials(
      `${user?.firstName || ""} ${user?.lastName || ""}`,
      200,
      200
    ).href;

  const handleLogout = async () => {
    const success = await logoutUser();

    if (success) {
      Alert.alert("Success", "You have been logged out");
      refetch();
    } else {
      Alert.alert("Error", "An error occurred while logging out");
    }
  };

  return (
    <SafeAreaView className="h-full bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-32 px-7"
      >
        <View className="flex items-center mt-5">
          <Text className="text-2xl font-normal">Profile</Text>
        </View>

        <View className="flex flex-row justify-center mt-5">
          <View className="flex flex-col items-center relative mt-5">
            <View className="size-44 rounded-full border border-gray-300 overflow-hidden bg-gray-100">
              <Image
                source={{ uri: imageUrl }}
                className="w-full h-full"
                resizeMode="cover"
              />
            </View>

            <Text className="text-2xl text-black-1 font-normal mt-2">
              {user?.firstName} {user?.lastName}
            </Text>
          </View>
        </View>

        <View className="flex flex-col mt-5">
          {profileSettings.slice(2).map((item, index) => (
            <SettingsItem key={index} {...item} />
          ))}
        </View>

        <View className="mt-2">
          <SettingsItem
            icon={icons.logout}
            title="Logout"
            onPress={handleLogout}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;
