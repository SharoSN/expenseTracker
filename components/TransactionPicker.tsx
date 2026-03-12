import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView
} from "react-native";
import { TransactionCandidate } from "@/hooks/useAppSocket";

const CATEGORY_EMOJI: Record<string, string> = {
  groceries: "🛒",
  rent: "🏠",
  utilities: "💡",
  transportation: "🚗",
  entertainment: "🎬",
  dining: "🍽️",
  health: "💊",
  insurance: "🛡️",
  savings: "💰",
  clothing: "👕",
  personal: "🎁",
  others: "📦"
};

interface TransactionPickerProps {
  transactions: TransactionCandidate[];
  question?: string;
  onSelect: (transaction: TransactionCandidate) => void;
  onDismiss: () => void;
}

const TransactionPicker: React.FC<TransactionPickerProps> = ({
  transactions,
  question = "Which transaction would you like to delete?",
  onSelect,
  onDismiss
}) => {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onDismiss} />

      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>🗑️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Select Transaction</Text>
            <Text style={styles.subtitle}>{question}</Text>
          </View>
        </View>

        {/* Transaction list */}
        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {transactions.map((txn, index) => {
            const isIncome = txn.type === "income";
            const emoji = CATEGORY_EMOJI[txn.category] ?? "📦";
            const amountColor = isIncome ? "#10b981" : "#f43f5e";

            return (
              <TouchableOpacity
                key={txn.id}
                style={styles.txnRow}
                activeOpacity={0.7}
                onPress={() => onSelect(txn)}
              >
                {/* Index badge */}
                <View style={styles.indexBadge}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>

                {/* Category emoji */}
                <View style={styles.emojiBox}>
                  <Text style={styles.emoji}>{emoji}</Text>
                </View>

                {/* Details */}
                <View style={styles.details}>
                  <Text style={styles.category}>
                    {txn.category.charAt(0).toUpperCase() +
                      txn.category.slice(1)}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.walletName}>{txn.walletName}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.date}>{txn.date}</Text>
                  </View>
                </View>

                {/* Amount */}
                <Text style={[styles.amount, { color: amountColor }]}>
                  {txn.formattedAmount}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Cancel */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    maxHeight: "75%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 18
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fecdd3"
  },
  iconText: { fontSize: 18 },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 2
  },
  subtitle: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 16
  },
  list: {
    marginBottom: 12
  },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  indexBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center"
  },
  indexText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b"
  },
  emojiBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center"
  },
  emoji: { fontSize: 18 },
  details: { flex: 1 },
  category: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 3
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  walletName: {
    fontSize: 11,
    color: "#64748b"
  },
  dot: {
    fontSize: 11,
    color: "#cbd5e1"
  },
  date: {
    fontSize: 11,
    color: "#94a3b8"
  },
  amount: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    marginTop: 4
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b"
  }
});

export default TransactionPicker;
