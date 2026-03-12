import React from "react";
import { View, Text, StyleSheet } from "react-native";

const CATEGORY_META = {
  groceries: { emoji: "🛒", color: "#4ade80" },
  rent: { emoji: "🏠", color: "#60a5fa" },
  utilities: { emoji: "⚡", color: "#fbbf24" },
  transportation: { emoji: "🚌", color: "#a78bfa" },
  entertainment: { emoji: "🎬", color: "#f472b6" },
  dining: { emoji: "🍽️", color: "#fb923c" },
  health: { emoji: "💊", color: "#34d399" },
  insurance: { emoji: "🛡️", color: "#38bdf8" },
  savings: { emoji: "🏦", color: "#00f5c4" },
  clothing: { emoji: "👗", color: "#e879f9" },
  personal: { emoji: "✨", color: "#fde68a" },
  others: { emoji: "📦", color: "#94a3b8" }
};

export default function TransactionList({ transactions = [] }) {
  if (!transactions.length) return null;

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <View>
      {/* Summary row */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryCount}>
          {transactions.length} transactions
        </Text>
        <View style={styles.summaryAmounts}>
          <Text style={styles.incomeText}>+€{totalIncome.toFixed(2)}</Text>
          <Text style={styles.expenseText}>-€{totalExpense.toFixed(2)}</Text>
        </View>
      </View>

      {/* Transaction rows */}
      {transactions.map((t, i) => {
        const meta =
          CATEGORY_META[t.category?.toLowerCase()] || CATEGORY_META.others;
        const isIncome = t.type === "income";
        const isLast = i === transactions.length - 1;

        return (
          <View
            key={t.id || i}
            style={[styles.txRow, !isLast && styles.txRowBorder]}
          >
            {/* Icon */}
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: meta.color + "18",
                  borderColor: meta.color + "33"
                }
              ]}
            >
              <Text style={styles.iconEmoji}>{meta.emoji}</Text>
            </View>

            {/* Middle */}
            <View style={styles.txMiddle}>
              <View style={styles.txTopRow}>
                <Text style={styles.txCategory} numberOfLines={1}>
                  {t.category || "Other"}
                </Text>
                <View style={styles.walletBadge}>
                  <Text style={styles.walletBadgeText}>{t.walletName}</Text>
                </View>
              </View>
              <View style={styles.txBottomRow}>
                {t.description && (
                  <Text style={styles.txDescription} numberOfLines={1}>
                    {t.description}
                  </Text>
                )}
                <Text style={styles.txDate}>{t.date}</Text>
              </View>
            </View>

            {/* Amount */}
            <Text
              style={[
                styles.txAmount,
                { color: isIncome ? "#10b981" : "#f43f5e" }
              ]}
            >
              {t.formattedAmount}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  summaryCount: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2
  },
  summaryAmounts: { flexDirection: "row", gap: 12 },
  incomeText: { color: "#10b981", fontSize: 11, fontWeight: "700" },
  expenseText: { color: "#f43f5e", fontSize: 11, fontWeight: "700" },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10
  },
  txRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0
  },
  iconEmoji: { fontSize: 18 },

  txMiddle: { flex: 1, minWidth: 0 },
  txTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  txCategory: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize"
  },
  walletBadge: {
    backgroundColor: "#f1f5f9",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  walletBadgeText: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5
  },
  txBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2
  },
  txDescription: {
    color: "#94a3b8",
    fontSize: 11,
    flex: 1
  },
  txDate: {
    color: "#cbd5e1",
    fontSize: 10,
    flexShrink: 0
  },
  txAmount: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.3,
    flexShrink: 0
  }
});
