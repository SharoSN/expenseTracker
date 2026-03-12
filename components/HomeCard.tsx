import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable
} from "react-native";
import React, { useState, useMemo } from "react";
import { SafeAreaView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import icons from "@/constants/icons";
import { formatCurrency, useWalletStore } from "@/lib/walletStore";
import { useWalletData } from "@/hooks/useWalletData";

const HomeCard = ({
  onWalletSelect
}: {
  onWalletSelect?: (id: string | null) => void;
}) => {
  const currency = useWalletStore((state) => state.currency);
  const { wallets, isLoading } = useWalletData();

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  const selectedWallet = useMemo(() => {
    if (!selectedWalletId || !wallets) return null;
    return wallets.find((w) => w.$id === selectedWalletId) ?? null;
  }, [selectedWalletId, wallets]);

  const { totalBalance, totalIncome, totalExpense } = useMemo(() => {
    if (selectedWallet) {
      return {
        totalBalance: selectedWallet.amount || 0,
        totalIncome: selectedWallet.totalIncome || 0,
        totalExpense: selectedWallet.totalExpense || 0
      };
    }
    if (!wallets || wallets.length === 0) {
      return { totalBalance: 0, totalIncome: 0, totalExpense: 0 };
    }
    return wallets.reduce(
      (totals, wallet) => {
        totals.totalBalance += wallet.amount || 0;
        totals.totalIncome += wallet.totalIncome || 0;
        totals.totalExpense += wallet.totalExpense || 0;
        return totals;
      },
      { totalBalance: 0, totalIncome: 0, totalExpense: 0 }
    );
  }, [wallets, selectedWallet]);

  const handleSelectWallet = (walletId: string | null) => {
    setSelectedWalletId(walletId);
    setModalVisible(false);
    onWalletSelect?.(walletId);
  };

  const cardTitle = selectedWallet ? selectedWallet.name : "Total Balance";

  return (
    <SafeAreaView className="bg-white items-center">
      <View className="w-[90%] h-[300px] relative">
        {/* Stack Layer 1 */}
        <View className="absolute top-0 left-0 right-0 h-[240px] bg-[#FBCFE8] rounded-3xl z-10 scale-[0.94] shadow-sm" />
        {/* Stack Layer 2 */}
        <View className="absolute top-4 left-0 right-0 h-[240px] bg-[#A5B4FC] rounded-3xl z-20 scale-[0.97] shadow-md" />
        {/* Main Card */}
        <View className="absolute top-8 left-0 right-0 h-[260px] rounded-3xl overflow-hidden shadow-lg z-30 bg-white">
          <LinearGradient
            colors={["#B3E5FC", "#C5CAE9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Card Content */}
          <View className="p-6 flex-1 justify-between">
            <View className="flex-row justify-between items-center">
              <Text
                className="text-black text-2xl font-bold mt-4"
                numberOfLines={1}
              >
                {cardTitle}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                className="p-2 mt-4"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Image source={icons.dots} className="size-6" />
              </TouchableOpacity>
            </View>

            <View>
              <Text className="font-bold text-2xl text-black">
                {formatCurrency(totalBalance, currency)}
              </Text>
            </View>

            <View className="flex flex-row justify-between">
              {/* Income */}
              <View className="flex flex-col items-center">
                <View className="flex flex-row gap-2 items-center">
                  <Image source={icons.arrowDown} className="w-6 h-6" />
                  <Text className="font-semibold">Income</Text>
                </View>
                <Text className="text-green-600 font-bold text-xl mt-2">
                  {formatCurrency(totalIncome, currency)}
                </Text>
              </View>
              {/* Expense */}
              <View className="flex flex-col items-center">
                <View className="flex flex-row gap-2 items-center">
                  <Image source={icons.arrowUp} className="w-6 h-6" />
                  <Text className="font-semibold">Expense</Text>
                </View>
                <Text className="text-red-600 font-bold text-xl mt-2">
                  {formatCurrency(totalExpense, currency)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Wallet Selector Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalBox}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Select Wallet</Text>

            {/* All Wallets option */}
            <TouchableOpacity
              style={[
                styles.walletItem,
                !selectedWalletId && styles.walletItemSelected
              ]}
              onPress={() => handleSelectWallet(null)}
            >
              <Text
                style={[
                  styles.walletItemText,
                  !selectedWalletId && styles.walletItemTextSelected
                ]}
              >
                All Wallets
              </Text>
              {!selectedWalletId && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            {/* Individual wallets */}
            {isLoading ? (
              <Text
                style={{ textAlign: "center", color: "#888", marginTop: 10 }}
              >
                Loading wallets...
              </Text>
            ) : (
              <FlatList
                data={wallets || []}
                keyExtractor={(item) => item.$id}
                renderItem={({ item }) => {
                  const isSelected = selectedWalletId === item.$id;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.walletItem,
                        isSelected && styles.walletItemSelected
                      ]}
                      onPress={() => handleSelectWallet(item.$id)}
                    >
                      <View>
                        <Text
                          style={[
                            styles.walletItemText,
                            isSelected && styles.walletItemTextSelected
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text style={styles.walletItemBalance}>
                          {formatCurrency(item.amount || 0, currency)}
                        </Text>
                      </View>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalBox: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "80%",
    maxHeight: "60%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
    color: "#1a1a2e"
  },
  walletItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#f5f5f5"
  },
  walletItemSelected: {
    backgroundColor: "#C5CAE9"
  },
  walletItemText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333"
  },
  walletItemTextSelected: {
    color: "#3730a3"
  },
  walletItemBalance: {
    fontSize: 12,
    color: "#888",
    marginTop: 2
  },
  checkmark: {
    fontSize: 16,
    color: "#3730a3",
    fontWeight: "700"
  }
});

export default HomeCard;
