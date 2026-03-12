import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal } from "react-native";

const WALLET_ICONS: Record<string, string> = {
  btc: "₿",
  bitcoin: "₿",
  eth: "Ξ",
  ethereum: "Ξ",
  xrp: "✕",
  ripple: "✕",
  sol: "◎",
  solana: "◎",
  main: "💳",
  savings: "🏦",
  cash: "💵",
  crypto: "🔷",
  invest: "📈",
  investment: "📈",
  vacation: "✈️",
  travel: "✈️",
  food: "🍔",
  emergency: "🚨"
};

const WALLET_COLORS = [
  { bg: "#1a1a2e", accent: "#f7931a" }, // orange - crypto feel
  { bg: "#0f3460", accent: "#00f5c4" }, // teal
  { bg: "#1a1a2e", accent: "#627eea" }, // purple - eth feel
  { bg: "#0d1b2a", accent: "#ff6b6b" }, // red
  { bg: "#1a2f1a", accent: "#4caf50" }, // green
  { bg: "#2d1b33", accent: "#e040fb" } // purple
];

function getWalletIcon(name: string): string {
  const lower = name.toLowerCase().trim();
  for (const [key, icon] of Object.entries(WALLET_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "💼";
}

function getWalletColor(name: string, index: number) {
  return WALLET_COLORS[index % WALLET_COLORS.length];
}

interface WalletOption {
  id: string;
  name: string;
  amount: number;
}

interface WalletPickerProps {
  wallets: WalletOption[];
  question: string;
  onSelect: (wallet: WalletOption) => void;
  onDismiss: () => void;
}

const WalletPicker: React.FC<WalletPickerProps> = ({
  wallets,
  question,
  onSelect,
  onDismiss
}) => {
  return (
    <Modal transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity
        className="flex-1 bg-black/50 justify-end"
        activeOpacity={1}
        onPress={onDismiss}
      >
        <TouchableOpacity activeOpacity={1}>
          <View className="bg-white rounded-t-3xl p-6 pb-10">
            {/* Handle bar */}
            <View className="w-10 h-1 bg-gray-200 rounded-full self-center mb-4" />

            {/* Question */}
            <Text className="text-lg font-semibold text-gray-900 mb-1">
              Choose a wallet
            </Text>
            <Text className="text-sm text-gray-500 mb-5">{question}</Text>

            {/* Wallet grid */}
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="flex-row flex-wrap gap-3">
                {wallets.map((wallet, index) => {
                  const color = getWalletColor(wallet.name, index);
                  const icon = getWalletIcon(wallet.name);
                  return (
                    <TouchableOpacity
                      key={wallet.id}
                      onPress={() => onSelect(wallet)}
                      className="rounded-2xl p-4 items-center"
                      style={{
                        backgroundColor: color.bg,
                        width: "47%",
                        borderWidth: 1,
                        borderColor: color.accent + "40"
                      }}
                    >
                      {/* Icon circle */}
                      <View
                        className="w-12 h-12 rounded-full items-center justify-center mb-2"
                        style={{ backgroundColor: color.accent + "20" }}
                      >
                        <Text style={{ fontSize: 22 }}>{icon}</Text>
                      </View>

                      {/* Wallet name */}
                      <Text
                        className="font-semibold text-sm text-center mb-1"
                        style={{ color: "#fff" }}
                        numberOfLines={1}
                      >
                        {wallet.name}
                      </Text>

                      {/* Balance */}
                      <Text
                        className="text-xs text-center"
                        style={{ color: color.accent }}
                      >
                        €{wallet.amount.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Cancel */}
            <TouchableOpacity
              onPress={onDismiss}
              className="mt-5 py-3 rounded-2xl bg-gray-100 items-center"
            >
              <Text className="text-gray-600 font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

export default WalletPicker;
