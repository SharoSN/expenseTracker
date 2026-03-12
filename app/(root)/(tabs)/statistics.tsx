import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Dimensions
} from "react-native";
import React, { useMemo, useState, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native";
import HeaderBox from "@/components/HeaderBox";
import { BarChart } from "react-native-gifted-charts";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { TransactionsList } from "@/components/TransactionsList";
import { useTransactionData } from "@/hooks/userTransactionData";
import { formatCurrency, useWalletStore } from "@/lib/walletStore";

dayjs.extend(isoWeek);
dayjs.extend(isSameOrAfter);

const SCREEN_WIDTH = Dimensions.get("window").width;

const chooseStepValue = (maxValue: number) => {
  const roughStep = maxValue / 4;
  if (roughStep <= 0) return 25;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  for (const m of [1, 2, 5, 10]) {
    const step = m * magnitude;
    if (step >= roughStep) return step;
  }
  return magnitude * 10;
};

const Statistics = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [chartScrollX, setChartScrollX] = useState(0);

  const chartScrollRef = useRef<ScrollView>(null);

  // ONE source of truth — all three views respect these
  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month()); // 0-based

  const currency = useWalletStore((state) => state.currency);
  const { data: transactions = [], isLoading, refetch } = useTransactionData();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Chart scroll buttons ───────────────────────────────────────────────────
  const scrollChart = (direction: "left" | "right") => {
    const amount = 150;
    const newX =
      direction === "right"
        ? chartScrollX + amount
        : Math.max(0, chartScrollX - amount);
    chartScrollRef.current?.scrollTo({ x: newX, animated: true });
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const canGoNextYear = selectedYear < dayjs().year();
  const canGoNextMonth = !(
    selectedYear === dayjs().year() && selectedMonth === dayjs().month()
  );

  const goToPrevYear = () => setSelectedYear((y) => y - 1);
  const goToNextYear = () => {
    if (canGoNextYear) setSelectedYear((y) => y + 1);
  };

  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else setSelectedMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (!canGoNextMonth) return;
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else setSelectedMonth((m) => m + 1);
  };

  // ── Filter: all 3 views respect the selected period ───────────────────────
  const filteredTransactions = useMemo(() => {
    if (activeIndex === 2) {
      return transactions.filter(
        (tx) => dayjs(tx.date).year() === selectedYear
      );
    }
    return transactions.filter((tx) => {
      const d = dayjs(tx.date);
      return d.year() === selectedYear && d.month() === selectedMonth;
    });
  }, [transactions, activeIndex, selectedYear, selectedMonth]);

  // ── Group for chart ────────────────────────────────────────────────────────
  const groupedBarData = useMemo(() => {
    if (activeIndex === 0) {
      const inc = Array(7).fill(0);
      const exp = Array(7).fill(0);
      filteredTransactions.forEach((tx) => {
        const i = dayjs(tx.date).isoWeekday() - 1; // 0=Mon, 6=Sun
        if (tx.type === "income") inc[i] += tx.amount;
        else exp[i] += tx.amount;
      });
      return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
        (label, i) => ({ label, income: inc[i], expense: exp[i] })
      );
    }

    if (activeIndex === 1) {
      const ref = dayjs(
        `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`
      );
      const days = ref.daysInMonth();
      const grouped: Record<number, { income: number; expense: number }> = {};
      filteredTransactions.forEach((tx) => {
        const day = dayjs(tx.date).date();
        if (!grouped[day]) grouped[day] = { income: 0, expense: 0 };
        if (tx.type === "income") grouped[day].income += tx.amount;
        else grouped[day].expense += tx.amount;
      });
      return Array.from({ length: days }, (_, i) => ({
        label: String(i + 1),
        income: grouped[i + 1]?.income ?? 0,
        expense: grouped[i + 1]?.expense ?? 0
      }));
    }

    // Yearly
    const grouped: Record<number, { income: number; expense: number }> = {};
    filteredTransactions.forEach((tx) => {
      const m = dayjs(tx.date).month();
      if (!grouped[m]) grouped[m] = { income: 0, expense: 0 };
      if (tx.type === "income") grouped[m].income += tx.amount;
      else grouped[m].expense += tx.amount;
    });
    return Array.from({ length: 12 }, (_, m) => ({
      label: dayjs(
        `${selectedYear}-${String(m + 1).padStart(2, "0")}-01`
      ).format("MMM"),
      income: grouped[m]?.income ?? 0,
      expense: grouped[m]?.expense ?? 0
    }));
  }, [filteredTransactions, activeIndex, selectedYear, selectedMonth]);

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalIncome = filteredTransactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const totalExpense = filteredTransactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    return { totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [filteredTransactions]);

  // ── Chart config ───────────────────────────────────────────────────────────
  const chartData = useMemo(
    () =>
      groupedBarData.flatMap((d) => [
        { value: d.income, label: d.label, frontColor: "#22c55e", spacing: 4 },
        { value: d.expense, label: "", frontColor: "#ef4444" }
      ]),
    [groupedBarData]
  );

  const formatY = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return `${v}`;
  };

  const rawMax = Math.max(
    ...groupedBarData.flatMap((d) => [d.income, d.expense]),
    100
  );
  const stepValue = chooseStepValue(rawMax * 1.2);
  const noOfSections = 4;
  const roundedMaxValue = stepValue * noOfSections;
  const yAxisLabelTexts = Array.from({ length: noOfSections + 1 }, (_, i) =>
    formatY(stepValue * i)
  );

  const yAxisWidth = 55;
  const slotWidth = Math.floor(
    (SCREEN_WIDTH - 48 - yAxisWidth) / groupedBarData.length
  );
  const barWidth = Math.max(6, Math.floor(slotWidth * 0.35));
  const pairSpacing = Math.max(2, slotWidth - barWidth * 2 - 4);

  const periodLabel =
    activeIndex === 2
      ? `${selectedYear}`
      : dayjs(
          `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`
        ).format("MMMM YYYY");

  const nextDisabled = activeIndex === 2 ? !canGoNextYear : !canGoNextMonth;
  const onPrev = activeIndex === 2 ? goToPrevYear : goToPrevMonth;
  const onNext = activeIndex === 2 ? goToNextYear : goToNextMonth;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="p-6"
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <HeaderBox
          type="Statistics"
          title="Statistics"
          subtext="Overview of your income & expenses"
        />

        {/* Summary Cards */}
        <View className="flex-row justify-between mt-4 mb-4">
          <View className="flex-1 bg-green-100 p-4 rounded-xl mr-2">
            <Text className="text-green-700 font-bold">Income</Text>
            <Text className="text-green-800 text-xl font-bold">
              {formatCurrency(summary.totalIncome, currency)}
            </Text>
          </View>
          <View className="flex-1 bg-red-100 p-4 rounded-xl mr-2">
            <Text className="text-red-700 font-bold">Expense</Text>
            <Text className="text-red-800 text-xl font-bold">
              {formatCurrency(summary.totalExpense, currency)}
            </Text>
          </View>
          <View className="flex-1 bg-blue-100 p-4 rounded-xl">
            <Text className="text-blue-700 font-bold">Net</Text>
            <Text className="text-blue-800 text-xl font-bold">
              {formatCurrency(summary.net, currency)}
            </Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#f1f5f9",
            borderRadius: 12,
            padding: 3,
            marginVertical: 12
          }}
        >
          {["Weekly", "Monthly", "Yearly"].map((label, index) => (
            <TouchableOpacity
              key={label}
              onPress={() => {
                setActiveIndex(index);
                // Reset chart scroll when switching tabs
                setChartScrollX(0);
                chartScrollRef.current?.scrollTo({ x: 0, animated: false });
              }}
              style={{
                flex: 1,
                paddingVertical: 9,
                alignItems: "center",
                borderRadius: 10,
                backgroundColor:
                  activeIndex === index ? "#ffffff" : "transparent",
                elevation: activeIndex === index ? 2 : 0
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: activeIndex === index ? "700" : "500",
                  color: activeIndex === index ? "#0ea5e9" : "#94a3b8"
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Period Navigator */}
        <View className="flex-row justify-between items-center mt-4 mb-4">
          <TouchableOpacity onPress={onPrev}>
            <Text className="text-lg font-semibold text-blue-600">
              ← Previous
            </Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-800">{periodLabel}</Text>
          <TouchableOpacity onPress={onNext} disabled={nextDisabled}>
            <Text
              className={`text-lg font-semibold ${
                nextDisabled ? "text-gray-300" : "text-blue-600"
              }`}
            >
              Next →
            </Text>
          </TouchableOpacity>
        </View>

        {/* Chart scroll buttons — only on Monthly */}
        {activeIndex === 1 && (
          <View className="flex-row justify-end gap-3 mb-2">
            <TouchableOpacity
              onPress={() => scrollChart("left")}
              style={{
                backgroundColor: "#f1f5f9",
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 10
              }}
            >
              <Text
                style={{ fontSize: 18, color: "#374151", fontWeight: "700" }}
              >
                ‹
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => scrollChart("right")}
              style={{
                backgroundColor: "#f1f5f9",
                paddingHorizontal: 16,
                paddingVertical: 6,
                borderRadius: 10
              }}
            >
              <Text
                style={{ fontSize: 18, color: "#374151", fontWeight: "700" }}
              >
                ›
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Chart */}
        <ScrollView
          ref={chartScrollRef}
          horizontal={activeIndex === 1}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={activeIndex === 1}
          onScroll={(e) => setChartScrollX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
        >
          <View className="relative flex justify-center items-center mt-2">
            <BarChart
              data={chartData}
              barWidth={barWidth}
              barBorderRadius={6}
              labelWidth={activeIndex === 1 ? 18 : 30}
              spacing={pairSpacing}
              initialSpacing={15}
              noOfSections={noOfSections}
              stepValue={stepValue}
              maxValue={roundedMaxValue}
              isAnimated={activeIndex !== 1}
              hideRules
              yAxisThickness={0}
              xAxisThickness={0}
              yAxisLabelWidth={yAxisWidth}
              yAxisLabelTexts={yAxisLabelTexts}
              yAxisTextStyle={{ color: "#6b7280" }}
              xAxisLabelTextStyle={{
                color: "#374151",
                fontSize: activeIndex === 1 ? 9 : 12
              }}
              showYAxisIndices={false}
            />
          </View>
        </ScrollView>

        {/* Legend */}
        <View className="flex-row justify-center mt-6 gap-6">
          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-green-500" />
            <Text className="text-gray-700 text-sm">Income</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-red-500" />
            <Text className="text-gray-700 text-sm">Expense</Text>
          </View>
        </View>

        <TransactionsList
          title="Transactions"
          data={filteredTransactions}
          loading={isLoading}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Statistics;
