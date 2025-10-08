import { View, Text } from "react-native";
import React from "react";

const HeaderBox = ({ type = "title", title, subtext, user }: any) => {
  return (
    <View className="flex flex-col gap-1">
      <View className="">
        <Text className="text-2xl font-semibold text-gray-900">
          {title}
          {type === "greeting" && (
            <Text className="text-blue-400 font-bold">&nbsp;{user}</Text>
          )}
        </Text>

        <Text className="text-14 font-normal text-gray-600">{subtext}</Text>
      </View>
    </View>
  );
};

export default HeaderBox;
