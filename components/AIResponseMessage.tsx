import React from "react";
import { View, Text, ScrollView, Dimensions, StyleSheet } from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";
import TransactionList from "./TransactionList";

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

// ─── Parse analytics text into sections ──────────────────────────────────────
function parseAnalyticsText(text) {
  if (!text || !text.includes("Spending Analytics")) return null;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const result = {
    title: "",
    summary: [],
    categories: [],
    anomalies: [],
    insights: []
  };
  let section = "summary";

  for (const line of lines) {
    if (line.startsWith("📊")) {
      result.title = line;
      continue;
    }
    if (line.startsWith("── Category")) {
      section = "categories";
      continue;
    }
    if (line.startsWith("── ⚠️")) {
      section = "anomalies";
      continue;
    }
    if (line.startsWith("── 💡")) {
      section = "insights";
      continue;
    }

    if (section === "summary" && line.includes(":")) {
      const colonIdx = line.indexOf(":");
      result.summary.push({
        label: line.slice(0, colonIdx).trim(),
        value: line.slice(colonIdx + 1).trim()
      });
    } else if (section === "categories") {
      result.categories.push(line);
    } else if (section === "anomalies") {
      result.anomalies.push(line);
    } else if (section === "insights") {
      result.insights.push(line);
    }
  }
  return result;
}

const STAT_COLORS = {
  Balance: "#0ea5e9",
  Income: "#10b981",
  Expenses: "#f43f5e"
};

const CATEGORY_COLORS = [
  "#0ea5e9",
  "#f43f5e",
  "#f59e0b",
  "#a78bfa",
  "#38bdf8",
  "#fb923c",
  "#10b981",
  "#e879f9",
  "#34d399",
  "#f472b6"
];

// ─── Structured Summary Card ──────────────────────────────────────────────────
const SummaryCard = ({ text }) => {
  const parsed = parseSummaryText(text);
  if (!parsed) return <Text style={styles.aiText}>{text}</Text>;
  return (
    <View style={styles.summaryContainer}>
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
      <View style={styles.divider} />
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

// ─── Budget List Card ─────────────────────────────────────────────────────────
const BudgetListCard = ({ budgets }) => {
  if (!budgets || budgets.length === 0)
    return <Text style={styles.aiText}>No budgets found.</Text>;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>MONTHLY BUDGETS</Text>
      {budgets.map((b) => {
        const color =
          b.pct >= 100 ? "#f43f5e" : b.pct >= 80 ? "#f59e0b" : "#10b981";
        const indicator = b.pct >= 100 ? "🔴" : b.pct >= 80 ? "🟡" : "🟢";
        return (
          <View key={b.id} style={styles.budgetItem}>
            {/* Label row */}
            <View style={styles.budgetLabelRow}>
              <Text style={styles.budgetLabel}>
                {indicator} {b.label.charAt(0).toUpperCase() + b.label.slice(1)}
              </Text>
              <Text style={styles.budgetAmounts}>
                €{b.spent.toFixed(2)}{" "}
                <Text style={styles.budgetLimit}>/ €{b.limit.toFixed(2)}</Text>
              </Text>
            </View>

            {/* Progress bar */}
            <View style={styles.budgetTrack}>
              <View
                style={[
                  styles.budgetFill,
                  { width: `${Math.min(b.pct, 100)}%`, backgroundColor: color }
                ]}
              />
            </View>

            {/* Footer row */}
            <View style={styles.budgetFooterRow}>
              <Text style={[styles.budgetPct, { color }]}>{b.pct}% used</Text>
              <Text style={styles.budgetRemaining}>
                €{b.remaining.toFixed(2)} remaining
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

// ─── Analytics Card ───────────────────────────────────────────────────────────
const AnalyticsCard = ({ message, chartWidth }) => {
  const viz = message.visualization;
  const parsed = parseAnalyticsText(message.text);

  // Weekly bar chart (first chart in array)
  const weeklyChart = viz.charts?.find((c) => c.chartType === "bar");
  // Pie / category chart (second chart)
  const categoryChart = viz.charts?.find((c) => c.chartType === "pie");

  const weeklyBarData = (weeklyChart?.data || []).map((item) => ({
    value: item.amount || 0,
    label: item.label || "",
    frontColor: "#f43f5e",
    gradientColor: "#fb7185",
    labelTextStyle: styles.axisLabel,
    labelWidth: 44,
    spacing: 8
  }));

  const weeklyMax = Math.max(
    ...(weeklyChart?.data || []).map((d) => d.amount || 0),
    1
  );
  const weeklyYMax = Math.ceil(weeklyMax / 50) * 50 + 50;

  const anomalies = viz.anomalies || [];
  const insights = viz.insights || [];

  return (
    <View>
      {/* ── Title ── */}
      {parsed?.title ? (
        <Text style={styles.analyticsTitle}>{parsed.title}</Text>
      ) : null}

      {/* ── Month summary stats ── */}
      {parsed?.summary?.length > 0 && (
        <View style={styles.summaryStatsRow}>
          {parsed.summary.slice(0, 3).map((s, i) => (
            <View key={i} style={styles.summaryStatBox}>
              <Text style={styles.summaryStatLabel}>
                {s.label.toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.summaryStatValue,
                  {
                    color: s.label.toLowerCase().includes("change")
                      ? s.value.startsWith("+")
                        ? "#10b981"
                        : "#f43f5e"
                      : "#0f172a"
                  }
                ]}
              >
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Category Breakdown ── */}
      {parsed?.categories?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CATEGORY BREAKDOWN</Text>
          {parsed.categories.map((line, i) => {
            const isUp = line.startsWith("↑");
            const isDown = line.startsWith("↓");
            const color = isUp ? "#f43f5e" : isDown ? "#10b981" : "#64748b";
            return (
              <View key={i} style={styles.categoryRow}>
                <View
                  style={[
                    styles.categoryDot,
                    {
                      backgroundColor:
                        CATEGORY_COLORS[i % CATEGORY_COLORS.length]
                    }
                  ]}
                />
                <Text style={[styles.categoryLine, { color }]}>{line}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Weekly Spending Bar Chart ── */}
      {weeklyBarData.length > 0 && (
        <View style={styles.chartBox}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>
              {weeklyChart?.title || "Weekly Spending"}
            </Text>
            <Text style={styles.chartBadge}>8W ↗</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View
              style={{
                minWidth: Math.max(chartWidth - 28, 320),
                paddingBottom: 4
              }}
            >
              <BarChart
                data={weeklyBarData}
                barWidth={22}
                spacing={8}
                initialSpacing={10}
                isAnimated
                animationDuration={800}
                yAxisColor="#e2e8f0"
                xAxisColor="#e2e8f0"
                yAxisLabelWidth={42}
                yAxisTextStyle={styles.axisLabel}
                xAxisLabelTextStyle={styles.axisLabel}
                hideRules={false}
                rulesColor="#f1f5f9"
                rulesType="dashed"
                dashWidth={3}
                dashGap={5}
                height={180}
                width={Math.max(chartWidth - 28, 320)}
                maxValue={weeklyYMax}
                noOfSections={4}
                roundedTop
                showGradient
                backgroundColor="#f8faff"
              />
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Category Pie (rendered as horizontal bar breakdown) ── */}
      {categoryChart?.data?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THIS MONTH BY CATEGORY</Text>
          {(() => {
            const total = categoryChart.data.reduce(
              (s, d) => s + (d.value || 0),
              0
            );
            return categoryChart.data.map((item, i) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              const color =
                categoryChart.colors?.[i] ||
                CATEGORY_COLORS[i % CATEGORY_COLORS.length];
              return (
                <View key={i} style={styles.pieBarRow}>
                  <Text style={styles.pieBarLabel}>{item.label}</Text>
                  <View style={styles.pieBarTrack}>
                    <View
                      style={[
                        styles.pieBarFill,
                        {
                          width: `${Math.max(pct, 2)}%`,
                          backgroundColor: color
                        }
                      ]}
                    />
                  </View>
                  <Text style={styles.pieBarPct}>{pct.toFixed(1)}%</Text>
                </View>
              );
            });
          })()}
        </View>
      )}

      {/* ── Anomalies ── */}
      {anomalies.length > 0 && (
        <View style={[styles.section, styles.anomalySection]}>
          <Text style={styles.sectionLabel}>⚠️ ANOMALIES</Text>
          {anomalies.map((a, i) => (
            <View key={i} style={styles.anomalyRow}>
              <Text style={styles.anomalySeverity}>
                {a.severity === "high" ? "🔴" : "🟡"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.anomalyCategory}>
                  {a.category?.toUpperCase()}
                </Text>
                <Text style={styles.anomalyText}>
                  €{a.currentAmount?.toFixed(2)} this month — {a.percentAbove}%
                  above your usual €{a.historicalAvg?.toFixed(2)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Smart Insights ── */}
      {insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>💡 SMART INSIGHTS</Text>
          {insights.map((insight, i) => (
            <View key={i} style={styles.insightRow}>
              <Text style={styles.insightEmoji}>{insight.emoji || "•"}</Text>
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// ─── Single Chart (existing summary chart logic — unchanged) ──────────────────
const SingleChartCard = ({ message, chartWidth }) => {
  const { chartType, data, title, series } = message.visualization;

  const safeSeries = series || [];

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

  const normalizedData = (data || []).map((item) => ({
    label: formatLabel(item.label || item.date || ""),
    income: item.income || 0,
    expense: item.expense || 0,
    ...safeSeries.reduce((acc, ser) => {
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
    value: safeSeries[0] ? item[safeSeries[0].key] : item.income,
    label: item.label,
    dataPointColor: "#0ea5e9",
    dataPointRadius: 5,
    labelTextStyle: styles.axisLabel
  }));

  const allValues = normalizedData.flatMap((item) =>
    safeSeries.map((ser) => item[ser.key] || 0)
  );
  const maxValue = Math.max(...allValues, 1);
  const yAxisMax = Math.ceil(maxValue / 100) * 100 + 100;

  const totalIncome = normalizedData.reduce((s, i) => s + i.income, 0);
  const totalExpense = normalizedData.reduce((s, i) => s + i.expense, 0);
  const net = totalIncome - totalExpense;

  return (
    <View>
      <SummaryCard text={message.text} />

      <View style={styles.statsRow}>
        {[
          { label: "INCOME", value: totalIncome, color: "#10b981" },
          { label: "EXPENSES", value: totalExpense, color: "#f43f5e" },
          { label: "NET", value: net, color: net >= 0 ? "#10b981" : "#f43f5e" }
        ].map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={[styles.statValue, { color: stat.color }]}>
              €{Math.abs(stat.value).toFixed(0)}
            </Text>
          </View>
        ))}
      </View>

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

      <View style={styles.legendContainer}>
        {safeSeries.map((ser) => (
          <View key={ser.key} style={styles.legendItem}>
            <View
              style={[
                styles.legendLine,
                {
                  backgroundColor: ser.key === "income" ? "#0ea5e9" : "#f43f5e"
                }
              ]}
            />
            <Text style={styles.legendText}>{ser.name}</Text>
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

  const isMultiChart = message.visualization?.type === "multi_chart";
  const isTransactionList = message.visualization?.type === "transaction_list";
  const isBudgetList = message.visualization?.type === "budget_list"; // ✅ NEW
  const isSingleChart =
    message.visualization &&
    !isMultiChart &&
    !isTransactionList &&
    !isBudgetList; // ✅ UPDATED

  return (
    <View style={styles.outerContainer}>
      <View style={styles.accentLine} />
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.glowDot} />
          <Text style={styles.headerTitle}>AI Assistant</Text>
          {(isMultiChart || isSingleChart) && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {isMultiChart ? "ANALYTICS" : "ANALYSIS"}
              </Text>
            </View>
          )}
          {isTransactionList && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>RECENT</Text>
            </View>
          )}
          {isBudgetList && ( // ✅ NEW badge
            <View style={styles.badge}>
              <Text style={styles.badgeText}>BUDGETS</Text>
            </View>
          )}
        </View>

        {isMultiChart ? (
          <AnalyticsCard message={message} chartWidth={chartWidth} />
        ) : isTransactionList ? (
          <TransactionList
            transactions={message.visualization?.transactions ?? []}
          />
        ) : isBudgetList ? ( // ✅ NEW branch
          <BudgetListCard budgets={message.visualization?.budgets ?? []} />
        ) : isSingleChart ? (
          <SingleChartCard message={message} chartWidth={chartWidth} />
        ) : (
          <SummaryCard text={message.text} />
        )}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: { marginHorizontal: 12, marginBottom: 16 },
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
  header: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
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
  aiText: { color: "#475569", fontSize: 13, lineHeight: 20, marginBottom: 14 },

  // ── Summary ──
  summaryContainer: { marginBottom: 16 },
  summaryStatsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
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
  summaryStatValue: { fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginBottom: 12 },
  walletsHeading: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8
  },
  walletsList: { gap: 6 },
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
  walletName: { color: "#64748b", fontSize: 13, flex: 1 },
  walletAmount: { color: "#0f172a", fontSize: 13, fontWeight: "600" },

  // ── Budget List ──
  budgetItem: {
    marginBottom: 16
  },
  budgetLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6
  },
  budgetLabel: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "600"
  },
  budgetAmounts: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700"
  },
  budgetLimit: {
    color: "#94a3b8",
    fontWeight: "400"
  },
  budgetTrack: {
    height: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    overflow: "hidden"
  },
  budgetFill: {
    height: "100%",
    borderRadius: 4
  },
  budgetFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4
  },
  budgetPct: {
    fontSize: 11,
    fontWeight: "600"
  },
  budgetRemaining: {
    color: "#94a3b8",
    fontSize: 11
  },

  // ── Stats row ──
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
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
  statValue: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },

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
  axisLabel: { color: "#94a3b8", fontSize: 9, fontWeight: "500" },

  // ── Legend ──
  legendContainer: { flexDirection: "row", justifyContent: "center", gap: 20 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendLine: { width: 22, height: 3, borderRadius: 2 },
  legendText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4
  },

  // ── Analytics ──
  analyticsTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12
  },
  section: { marginBottom: 16 },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 5
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  categoryLine: {
    fontSize: 11,
    flex: 1,
    lineHeight: 17,
    fontFamily: "monospace"
  },

  // ── Pie bar breakdown ──
  pieBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8
  },
  pieBarLabel: { color: "#64748b", fontSize: 11, width: 90 },
  pieBarTrack: {
    flex: 1,
    height: 7,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    overflow: "hidden"
  },
  pieBarFill: { height: "100%", borderRadius: 4 },
  pieBarPct: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "600",
    width: 38,
    textAlign: "right"
  },

  // ── Anomalies ──
  anomalySection: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fed7aa"
  },
  anomalyRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    alignItems: "flex-start"
  },
  anomalySeverity: { fontSize: 14, marginTop: 1 },
  anomalyCategory: {
    color: "#92400e",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2
  },
  anomalyText: { color: "#78350f", fontSize: 11, lineHeight: 16 },

  // ── Smart Insights ──
  insightRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginBottom: 8,
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#bae6fd"
  },
  insightEmoji: { fontSize: 14 },
  insightText: { color: "#0c4a6e", fontSize: 12, lineHeight: 18, flex: 1 }
});

export default AIResponseMessages;
