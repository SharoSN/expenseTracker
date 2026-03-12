import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ScrollView,
  View,
  Text,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { useAppSocket, TransactionCandidate } from "@/hooks/useAppSocket";
import { useGlobalContext } from "@/lib/global-provider";
import ChatInterface from "@/components/chat-interface";
import { ChatInput } from "@/components/AICharacter";
import { useFocusEffect, useNavigation } from "expo-router";
import WalletPicker from "@/components/WalletPicker";
import TransactionPicker from "@/components/TransactionPicker";
import AIAvatarHeader from "@/components/AIAvatarHeader";
import { PaywallModal } from "@/components/PaywallModal";

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

const Velora = () => {
  const { user } = useGlobalContext();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "assistant", content: "Hello! How can I help you?" }
  ]);
  const scrollViewRef = useRef<ScrollView>(null);
  const chatInputRef = useRef<any>(null);
  const navigation = useNavigation();

  useFocusEffect(
    React.useCallback(() => {
      navigation.getParent()?.setOptions({ tabBarStyle: { display: "none" } });
      return () => {
        navigation
          .getParent()
          ?.setOptions({ tabBarStyle: { display: "flex" } });
      };
    }, [navigation])
  );

  const {
    sendMessage,
    lastMessage,
    lastVisualization,
    clearLastMessage,
    walletSelection,
    setWalletSelection,
    transactionSelection,
    setTransactionSelection,
    paywallVisible,
    setPaywallVisible
  } = useAppSocket(user?.$id);

  // ── Wallet picker handler (unchanged) ──────────────────────────────────────
  const handleWalletSelect = (wallet: {
    id: string;
    name: string;
    amount: number;
  }) => {
    setWalletSelection(null);
    sendMessage({ type: "text", text: wallet.name });
  };

  // ── Transaction picker handler ──────────────────────────────────────────────
  const handleTransactionSelect = (txn: TransactionCandidate) => {
    setTransactionSelection(null);
    // Send the index label so the server's resolveTransactionFromInput matches it.
    // Using "first"/"second" etc. works, but sending the category + wallet is
    // more robust since the server also matches on those keywords.
    sendMessage({
      type: "text",
      text: `${txn.category} ${txn.walletName}`
    });
  };

  useEffect(() => {
    if (lastMessage) {
      if (lastMessage === "No audio received") {
        clearLastMessage();
        setLoading(false);
        return;
      }
      // Don't add a message bubble while a picker is open — wait for resolution
      if (walletSelection !== null || transactionSelection !== null) {
        setLoading(false);
        return;
      }
      const aiMsg: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: lastMessage,
        visualization: lastVisualization || undefined
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      clearLastMessage();
    }
  }, [
    lastMessage,
    lastVisualization,
    clearLastMessage,
    walletSelection,
    transactionSelection
  ]);

  const handleSubmit = () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim()
    };
    setMessages((prev) => [...prev, userMsg]);
    sendMessage({ type: "text", userId: user?.$id, text: input.trim() });
    setInput("");
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <KeyboardAvoidingView
        className="mb-16"
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 5 : 0}
      >
        <AIAvatarHeader isLoading={loading} name="Velora" />

        <View style={{ flex: 1 }}>
          <ChatInterface messages={messages} scrollViewRef={scrollViewRef} />
        </View>

        <View>
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

        {/* Wallet picker — unchanged */}
        {walletSelection && (
          <WalletPicker
            wallets={walletSelection}
            question="Which wallet should this transaction go to?"
            onSelect={handleWalletSelect}
            onDismiss={() => setWalletSelection(null)}
          />
        )}

        {/* Transaction picker — new */}
        {transactionSelection && (
          <TransactionPicker
            transactions={transactionSelection}
            question="I found a few matches. Which one would you like to delete?"
            onSelect={handleTransactionSelect}
            onDismiss={() => {
              setTransactionSelection(null);
              sendMessage({ type: "text", text: "cancel" });
            }}
          />
        )}
      </KeyboardAvoidingView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onUpgrade={() => {
          setPaywallVisible(false);
        }}
      />
    </SafeAreaView>
  );
};

export default Velora;
