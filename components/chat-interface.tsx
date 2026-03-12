import { View, Text, ScrollView, Platform } from "react-native";
import React, { useCallback } from "react";
import AIResponseMessage from "@/components/AIResponseMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  visualization?: {
    type: string;
    chartType?: "bar" | "line";
    data?: any[];
    title?: string;
    xAxis?: string;
    yAxis?: string;
    series?: Array<{ name: string; color: string; key: string }>;
    transactions?: any[];
    charts?: any[];
    anomalies?: any[];
    insights?: any[];
  };
}

interface ChatInterfaceProps {
  messages: Message[];
  scrollViewRef?: React.RefObject<ScrollView>;
}

// ─── Theme (matches AICharacter + AIAvatarHeader) ─────────────────────────────
const T = {
  accent: "#4fc3f7",
  accentDark: "#0ea5c9",
  accentSoft: "rgba(79,195,247,0.08)",
  accentBorder: "rgba(79,195,247,0.22)",
  accentGlow: "#4fc3f7",
  // User bubble: solid cyan
  userBubbleBg: "#4fc3f7",
  userText: "#ffffff",
  // AI bubble: soft tinted on white
  aiBubbleBg: "rgba(79,195,247,0.07)",
  aiBubbleBorder: "rgba(79,195,247,0.20)",
  aiText: "#111827"
};

// ─── Small ✦ accent replacing robot icon ─────────────────────────────────────
const AIAccent = () => (
  <View
    style={{
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: T.accentSoft,
      borderWidth: 1,
      borderColor: T.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      marginTop: 2,
      shadowColor: T.accentGlow,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 5,
      elevation: 2
    }}
  >
    <Text style={{ fontSize: 9, color: T.accent }}>✦</Text>
  </View>
);

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  scrollViewRef
}) => {
  const renderMessage = useCallback((msg: Message) => {
    const isUser = msg.role === "user";

    // Assistant message with chart
    if (!isUser && msg.visualization) {
      return (
        <View
          key={msg.id}
          style={{
            flexDirection: "row",
            marginVertical: 6,
            alignItems: "flex-start",
            justifyContent: "flex-start"
          }}
        >
          <AIAccent />
          <View style={{ flex: 1 }}>
            <AIResponseMessage
              message={{ text: msg.content, visualization: msg.visualization }}
            />
          </View>
        </View>
      );
    }

    // Regular text messages
    return (
      <View
        key={msg.id}
        style={{
          flexDirection: "row",
          marginVertical: 5,
          alignItems: "flex-end",
          justifyContent: isUser ? "flex-end" : "flex-start"
        }}
      >
        {/* AI accent — left side only */}
        {!isUser && <AIAccent />}

        {/* Bubble */}
        <View
          style={{
            maxWidth: "75%",
            paddingHorizontal: 14,
            paddingVertical: 10,
            // Tail: sharp top-right for user, sharp top-left for AI
            borderRadius: 20,
            borderTopRightRadius: isUser ? 4 : 20,
            borderTopLeftRadius: isUser ? 20 : 4,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,

            backgroundColor: isUser ? T.userBubbleBg : T.aiBubbleBg,
            borderWidth: isUser ? 0 : 1,
            borderColor: isUser ? "transparent" : T.aiBubbleBorder,

            // Cyan glow on user bubble
            shadowColor: isUser ? T.accentGlow : T.accentGlow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isUser ? 0.25 : 0.08,
            shadowRadius: isUser ? 8 : 4,
            elevation: isUser ? 3 : 1
          }}
        >
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: isUser ? T.userText : T.aiText,
              fontFamily: Platform.OS === "ios" ? "System" : "sans-serif"
            }}
          >
            {msg.content}
          </Text>
        </View>
      </View>
    );
  }, []);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
    >
      {messages.map(renderMessage)}
    </ScrollView>
  );
};

export default ChatInterface;
