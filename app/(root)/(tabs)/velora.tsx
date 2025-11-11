import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";
import { ChatInput } from "@/~/components/ui/chat-input";
import { ChatInterface } from "@/components/chat-interface";
import { useAppSocket } from "@/hooks/useAppSocket";
import { useGlobalContext } from "@/lib/global-provider";
import AICharacter from "@/components/AICharacter";

const Velora = () => {
  const { user } = useGlobalContext();

  const [input, setInput] = useState("");

  const [messages, setMessages] = useState([
    { id: "1", role: "assistant", content: "Hello! How can I help you?" },
  ]);
  const scrollViewRef = useRef<ScrollView>(null);

  const { sendMessage } = useAppSocket(user?.$id);

  const handleSubmit = () => {
    if (!input.trim()) return;

    // show user message immediately
    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // send to backend
    sendMessage({
      type: "text",
      userId: user?.$id,
      text: input.trim(),
    });

    setInput("");
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="container relative mx-auto flex-1 bg-white dark:bg-black"
        ref={scrollViewRef}
      >
        <ChatInterface messages={messages} scrollViewRef={scrollViewRef} />
      </ScrollView>

      <AICharacter />

      <View className="mb-24">
        <ChatInput
          input={input}
          onChangeText={setInput}
          onSubmit={handleSubmit}
          scrollViewRef={scrollViewRef}
          focusOnMount={false}
        />
      </View>
    </SafeAreaView>
  );
};

export default Velora;
