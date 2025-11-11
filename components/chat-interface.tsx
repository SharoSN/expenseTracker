import React, { forwardRef } from "react";
import { View, ScrollView, Text } from "react-native";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatInterfaceProps = {
  messages: Message[];
  scrollViewRef: React.RefObject<ScrollView>;
};

export const ChatInterface = forwardRef<ScrollView, ChatInterfaceProps>(
  ({ messages, scrollViewRef }, ref) => {
    return (
      <View className="flex-1 bg-white">
        <ScrollView ref={ref} className="flex-1 space-y-4 p-4">
          {!messages.length && (
            <View className="items-center justify-center flex-1">
              <Text className="text-gray-500">Start chatting...</Text>
            </View>
          )}

          {messages.map((m) => (
            <View
              key={m.id}
              className={`flex-row items-center mt-2 px-4 py-2 ${
                m.role === "user"
                  ? "ml-auto max-w-[80%] bg-gray-200 rounded-2xl"
                  : "max-w-[90%] bg-white rounded-2xl"
              }`}
            >
              {m.role !== "user" && <Text className="mr-2">🤖</Text>}
              <Text className="text-base text-black">{m.content}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  },
);
