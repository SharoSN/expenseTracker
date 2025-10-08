import { View, Text, SafeAreaView } from "react-native";
import React from "react";
import VoiceInput from "@/components/VoiceInput";
import TestExpense from "@/components/testExpense";
import AICharacter from "@/components/AICharacter";

const MyBanks = () => {
  return (
    <SafeAreaView>
      <View>
        <AICharacter />
      </View>
    </SafeAreaView>
  );
};

export default MyBanks;
