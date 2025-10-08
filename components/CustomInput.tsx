import { View, Text } from "react-native";
import React from "react";
import { Label } from "@/~/components/ui/label";
import { Input } from "@/~/components/ui/input";

const CustomInput = ({
  label,
  placeholder,
  value,
  onChangeText,
  errorMessage,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  errorMessage: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
}) => {
  return (
    <View className="flex flex-col gap-2">
      <Label nativeID={label}>{label}</Label>

      <Input
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        secureTextEntry={secureTextEntry}
        className="rounded-lg border border-gray-300 p-2"
      />

      {errorMessage ? (
        <Text className="text-red-500 text-xs">{errorMessage}</Text>
      ) : null}
    </View>
  );
};

export default CustomInput;
