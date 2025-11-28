import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";
import { useAppSocket } from "@/hooks/useAppSocket";
import { useGlobalContext } from "@/lib/global-provider";
import ChatInterface from "@/components/chat-interface";
import { ChatInput } from "@/components/AICharacter";

const Velora = () => {
  const { user } = useGlobalContext();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { id: "1", role: "assistant", content: "Hello! How can I help you?" },
  ]);
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<any>(null);

  // Single useAppSocket for both voice and text
  const { sendMessage, lastMessage, clearLastMessage, isConnected } = useAppSocket(user?.$id);

  // Listen for responses from backend (both voice and text)
  useEffect(() => {
    if (lastMessage) {
      console.log("📨 Received message from AI:", lastMessage);

      const aiMsg = {
        id: Date.now().toString(),
        role: "assistant",
        content: lastMessage,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);

      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);

      clearLastMessage();
    }
  }, [lastMessage, clearLastMessage]);

  const handleSubmit = () => {
    if (!input.trim() || loading) return;

    setLoading(true);

    // Show user message immediately
    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Send to backend
    sendMessage({
      type: "text",
      userId: user?.$id,
      text: input.trim(),
    });

    setInput("");

    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black justify-between">
      {/* Messages Display */}
      <View className="flex-1 bg-white dark:bg-black">
        <ChatInterface messages={messages} scrollViewRef={scrollViewRef} />
      </View>

      {/* Chat Input with Integrated Mic & Voice Support */}
      <View className="mb-24">

        <ChatInput
          ref={chatInputRef}
          input={input}
          onChangeText={setInput}
          onSubmit={handleSubmit}
          scrollViewRef={scrollViewRef}
          focusOnMount={false}
          loading={loading}
          sendMessage={sendMessage}  // ← PASS THIS
        />

      </View>

    </SafeAreaView>
  );
};

export default Velora;
