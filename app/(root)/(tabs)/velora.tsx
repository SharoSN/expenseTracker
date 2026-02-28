import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, View, Text } from "react-native";
import { useAppSocket } from "@/hooks/useAppSocket";
import { useGlobalContext } from "@/lib/global-provider";
import ChatInterface from "@/components/chat-interface";
import { ChatInput } from "@/components/AICharacter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  visualization?: {
    type: string;
    chartType: "bar" | "line";
    data: any[];
    title: string;
    xAxis: string;
    yAxis: string;
    series: Array<{
      name: string;
      color: string;
      key: string;
    }>;
  };
}

const Velora = () => {
  const { user } = useGlobalContext();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "assistant", content: "Hello! How can I help you?" }
  ]);
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<any>(null);

  // ✅ GET BOTH lastMessage AND lastVisualization
  const { sendMessage, lastMessage, lastVisualization, clearLastMessage } =
    useAppSocket(user?.$id);

  // ✅ LISTEN FOR RESPONSES FROM BACKEND WITH VISUALIZATION
  useEffect(() => {
    if (lastMessage) {
      // ✅ FILTER OUT: Don't show "No audio received" message
      if (lastMessage === "No audio received") {
        console.log("⏭️ Skipping 'No audio received' message");
        clearLastMessage();
        setLoading(false);
        return;
      }

      const aiMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: lastMessage,
        visualization: lastVisualization || undefined // ✅ ADD VISUALIZATION
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      clearLastMessage();
    }
  }, [lastMessage, lastVisualization, clearLastMessage]); // ✅ WATCH BOTH

  const handleSubmit = () => {
    if (!input.trim() || loading) return;

    setLoading(true);

    // Show user message immediately
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim()
    };
    setMessages((prev) => [...prev, userMsg]);

    // Send to backend
    sendMessage({
      type: "text",
      userId: user?.$id,
      text: input.trim()
    });

    setInput("");
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

      {/* Chat Input */}
      <View className="mb-24">
        <ChatInput
          ref={chatInputRef}
          input={input}
          onChangeText={setInput}
          onSubmit={handleSubmit}
          scrollViewRef={scrollViewRef}
          focusOnMount={false}
          loading={loading}
          sendMessage={sendMessage}
        />
      </View>
    </SafeAreaView>
  );
};

export default Velora;
