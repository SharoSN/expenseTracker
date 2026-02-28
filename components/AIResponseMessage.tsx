import React from "react";
import { View, Text, ScrollView, Dimensions, StyleSheet } from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";

// ─── Parse the plain-text summary the backend sends ──────────────────────────
function parseSummaryText(text) {
  if (!text || !text.startsWith("Financial Summary")) return null;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const result = { stats: [], wallets: [] };
  let inWallets = false;

  for (const line of lines) {
    if (line === "Financial Summary") continue;
    if (line.startsWith("Wallets")) {
      inWallets = true;
      continue;
    }
    if (inWallets) {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const name = line.slice(0, colonIdx).trim();
        const amount = line.slice(colonIdx + 1).trim();
        if (name && amount) result.wallets.push({ name, amount });
      }
    } else {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const label = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        if (label && value) result.stats.push({ label, value });
      }
    }
  }

  return result;
}

const STAT_COLORS = {
  Balance: "#0ea5e9",
  Income: "#10b981",
  Expenses: "#f43f5e"
};

// ─── Structured Summary Card ──────────────────────────────────────────────────
const SummaryCard = ({ text }) => {
  const parsed = parseSummaryText(text);
  if (!parsed) return <Text style={styles.aiText}>{text}</Text>;

  return (
    <View style={styles.summaryContainer}>
      {/* Stats row */}
      <View style={styles.summaryStatsRow}>
        {parsed.stats.map((stat) => (
          <View key={stat.label} style={styles.summaryStatBox}>
            <Text style={styles.summaryStatLabel}>
              {stat.label.toUpperCase()}
            </Text>
            <Text
              style={[
                styles.summaryStatValue,
                { color: STAT_COLORS[stat.label] || "#334155" }
              ]}
            >
              {stat.value.trim()}
            </Text>
          </View>
        ))}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Wallets */}
      <Text style={styles.walletsHeading}>WALLETS</Text>
      <View style={styles.walletsList}>
        {parsed.wallets.map((w, i) => (
          <View key={i} style={styles.walletRow}>
            <View style={styles.walletDot} />
            <Text style={styles.walletName}>{w.name}</Text>
            <Text style={styles.walletAmount}>{w.amount}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const AIResponseMessages = ({ message }) => {
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 80;

  if (message.visualization) {
    const { chartType, data, title, series } = message.visualization;

    const formatLabel = (rawLabel) => {
      if (!rawLabel) return "";
      const d = new Date(rawLabel);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric"
        });
      }
      return rawLabel;
    };

    const normalizedData = data.map((item) => ({
      label: formatLabel(item.label || item.date || ""),
      income: item.income || 0,
      expense: item.expense || 0,
      ...series.reduce((acc, ser) => {
        acc[ser.key] = item[ser.key] || 0;
        return acc;
      }, {})
    }));

    const barChartData = normalizedData.flatMap((item) => [
      {
        value: item.income,
        label: item.label,
        frontColor: "#0ea5e9",
        gradientColor: "#38bdf8",
        spacing: 3,
        labelWidth: 52,
        labelTextStyle: styles.axisLabel
      },
      {
        value: item.expense,
        label: "",
        frontColor: "#f43f5e",
        gradientColor: "#fb7185",
        spacing: 12
      }
    ]);

    const lineChartData = normalizedData.map((item) => ({
      value: series[0] ? item[series[0].key] : item.income,
      label: item.label,
      dataPointColor: "#0ea5e9",
      dataPointRadius: 5,
      labelTextStyle: styles.axisLabel
    }));

    const allValues = normalizedData.flatMap((item) =>
      series.map((ser) => item[ser.key] || 0)
    );
    const maxValue = Math.max(...allValues, 1);
    const yAxisMax = Math.ceil(maxValue / 100) * 100 + 100;

    const totalIncome = normalizedData.reduce((s, i) => s + i.income, 0);
    const totalExpense = normalizedData.reduce((s, i) => s + i.expense, 0);
    const net = totalIncome - totalExpense;

    return (
      <View style={styles.outerContainer}>
        <View style={styles.accentLine} />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.glowDot} />
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ANALYSIS</Text>
            </View>
          </View>

          {/* Summary text */}
          <SummaryCard text={message.text} />

          {/* Chart stats */}
          <View style={styles.statsRow}>
            {[
              { label: "INCOME", value: totalIncome, color: "#10b981" },
              { label: "EXPENSES", value: totalExpense, color: "#f43f5e" },
              {
                label: "NET",
                value: net,
                color: net >= 0 ? "#10b981" : "#f43f5e"
              }
            ].map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={[styles.statValue, { color: stat.color }]}>
                  €{Math.abs(stat.value).toFixed(0)}
                </Text>
              </View>
            ))}
          </View>

          {/* Chart */}
          <View style={styles.chartBox}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>{title}</Text>
              <Text style={styles.chartBadge}>7D ↗</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View
                style={{
                  minWidth: Math.max(chartWidth - 28, 320),
                  paddingBottom: 4
                }}
              >
                {chartType === "bar" && (
                  <BarChart
                    data={barChartData}
                    barWidth={16}
                    spacing={4}
                    initialSpacing={10}
                    isAnimated
                    animationDuration={800}
                    yAxisColor="#e2e8f0"
                    xAxisColor="#e2e8f0"
                    yAxisLabelWidth={42}
                    xAxisLabelTextStyle={styles.axisLabel}
                    yAxisTextStyle={styles.axisLabel}
                    hideRules={false}
                    rulesColor="#f1f5f9"
                    rulesType="dashed"
                    dashWidth={3}
                    dashGap={5}
                    height={200}
                    width={Math.max(chartWidth - 28, 320)}
                    maxValue={yAxisMax}
                    noOfSections={4}
                    roundedTop
                    showGradient
                    backgroundColor="#f8faff"
                  />
                )}

                {chartType === "line" && (
                  <LineChart
                    data={lineChartData}
                    width={Math.max(chartWidth - 28, 320)}
                    height={200}
                    showVerticalLines
                    verticalLinesColor="#f1f5f9"
                    color="#0ea5e9"
                    thickness={2.5}
                    curved
                    dataPointsColor="#0ea5e9"
                    dataPointsRadius={4}
                    xAxisColor="#e2e8f0"
                    yAxisColor="#e2e8f0"
                    yAxisLabelWidth={42}
                    yAxisTextStyle={styles.axisLabel}
                    xAxisLabelTextStyle={styles.axisLabel}
                    maxValue={yAxisMax}
                    noOfSections={4}
                    isAnimated
                    animationDuration={800}
                    startFillColor="#0ea5e9"
                    startOpacity={0.12}
                    endOpacity={0}
                    backgroundColor="#f8faff"
                  />
                )}
              </View>
            </ScrollView>
          </View>

          {/* Legend */}
          <View style={styles.legendContainer}>
            {series.map((ser) => (
              <View key={ser.key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendLine,
                    {
                      backgroundColor:
                        ser.key === "income" ? "#0ea5e9" : "#f43f5e"
                    }
                  ]}
                />
                <Text style={styles.legendText}>{ser.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // Regular text-only message
  return (
    <View style={styles.outerContainer}>
      <View style={styles.accentLine} />
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.glowDot} />
          <Text style={styles.headerTitle}>AI Assistant</Text>
        </View>
        <SummaryCard text={message.text} />
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    marginHorizontal: 12,
    marginBottom: 16
  },
  accentLine: {
    height: 2,
    backgroundColor: "#0ea5e9",
    opacity: 0.7,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20
  },
  card: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#e2e8f0",
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14
  },
  glowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#0ea5e9",
    marginRight: 8
  },
  headerTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    flex: 1
  },
  badge: {
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#bae6fd"
  },
  badgeText: {
    color: "#0ea5e9",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2
  },
  aiText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14
  },

  // ── Summary structured UI ──
  summaryContainer: {
    marginBottom: 16
  },
  summaryStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14
  },
  summaryStatBox: {
    flex: 1,
    backgroundColor: "#f8faff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center"
  },
  summaryStatLabel: {
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 5
  },
  summaryStatValue: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginBottom: 12
  },
  walletsHeading: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8
  },
  walletsList: {
    gap: 6
  },
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2
  },
  walletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#0ea5e9"
  },
  walletName: {
    color: "#64748b",
    fontSize: 13,
    flex: 1
  },
  walletAmount: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "600"
  },

  // ── Chart stats row ──
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f8faff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center"
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 5
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5
  },

  // ── Chart ──
  chartBox: {
    backgroundColor: "#f8faff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14
  },
  chartTitle: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  chartBadge: {
    color: "#0ea5e9",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1
  },
  axisLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "500"
  },

  // ── Legend ──
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  legendLine: {
    width: 22,
    height: 3,
    borderRadius: 2
  },
  legendText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4
  }
});

export default AIResponseMessages;
