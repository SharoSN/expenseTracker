
import { View, Text, ScrollView } from 'react-native';
import React, { useCallback } from 'react';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  scrollViewRef?: React.RefObject<ScrollView>;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, scrollViewRef }) => {
  // Memoize message rendering to prevent unnecessary re-renders
  const renderMessage = useCallback((msg: Message) => (
    <View
      key={msg.id}
      className={`flex-row my-2 items-center ${msg.role === "user" ? "justify-end" : "justify-start"
        }`}
    >
      {/* Bot Avatar */}
      {msg.role === "assistant" && (
        <View className="w-8 h-8 bg-gray-200 rounded-full items-center justify-center mr-2">
          <Text>🤖</Text>
        </View>
      )}

      {/* Message Bubble */}
      <View
        className={`p-3 rounded-2xl max-w-[75%] ${msg.role === "user" ? "bg-gray-900" : "bg-white"
          }`}
      >
        <Text
          className={msg.role === "user" ? "text-white" : "text-black"}
        >
          {msg.content}
        </Text>
      </View>
    </View>
  ), []);

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
    >
      <View className="p-4 space-y-2">
        {messages.map(renderMessage)}
      </View>
    </ScrollView>
  );
};

export default ChatInterface;
