import { View, Text, Image } from "react-native";
import React from "react";
import { Link } from "expo-router";
import { formatMoney } from "@/lib/utils";

const BankCard = () => {
  const userName = { firstName: "Sharo" };

  const formatAmount = formatMoney(1234.13);

  return (
    <View className="flex flex-col">
      <Link
        href="/"
        className="relative flex h-[190px] w-full max-w-[320px] justify-between rounded-[20px] border border-white bg-black-1 shadow-creditCard backdrop-blur-[6px] px-4 py-4"
      >
        <View className="flex flex-col justify-center gap-2">
          <View className="flex flex-row justify-between items-center gap-5">
            <Text className="text-lg font-semibold text-white">Sharo</Text>
            <Image
              source={require("../assets/icons/a-coffee.png")}
              width={20}
              height={24}
              alt="pay"
            />
          </View>

          <View className="font-black text-white">
            <Text className="text-white font-black">{formatAmount}</Text>
          </View>

          <View className="flex flex-col gap-5">
            <View className="flex justify-between gap-2">
              <Text className="text-12 font-semibold text-white">
                {userName.firstName}
              </Text>

              <Text className="text-12 font-semibold text-white">●● / ●●</Text>
            </View>

            <View className="flex flex-row items-center gap-5 ">
              <Text className="text-14 font-semibold tracking-1[1.1px] text-white">
                ●●●● ●●●● ●●●● <Text>{userName.firstName}</Text>
              </Text>

              <Image
                source={require("../assets/icons/mastercard.png")}
                width={45}
                height={32}
                alt="mastercard"
              />
            </View>
          </View>
        </View>
      </Link>
    </View>
  );
};

export default BankCard;
