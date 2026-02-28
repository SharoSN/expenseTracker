import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity
} from "react-native";
import React, { useMemo, useState, useCallback } from "react";
import { SafeAreaView } from "react-native";
import HeaderBox from "@/components/HeaderBox";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { BarChart } from "react-native-gifted-charts";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import weekday from "dayjs/plugin/weekday";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { TransactionsList } from "@/components/TransactionsList";
import { useTransactionData } from "@/hooks/userTransactionData";
import { formatCurrency, useWalletStore } from "@/lib/walletStore";

dayjs.extend(isoWeek);
dayjs.extend(weekday);
dayjs.extend(weekOfYear);

const chooseStepValue = (maxValue) => {
  const roughStep = maxValue / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const multiples = [1, 2, 5, 10];
  for (let i = 0; i < multiples.length; i++) {
    const step = multiples[i] * magnitude;
    if (step >= roughStep) return step;
  }
  return magnitude * 10;
};

const Statistics = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const currency = useWalletStore((state) => state.currency);

  const { data: transactions = [], isLoading, refetch } = useTransactionData();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Reset year when switching away from yearly view
  const handleSegmentChange = (e) => {
    setActiveIndex(e.nativeEvent.selectedSegmentIndex);
  };

  // Get available years from transactions
  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((tx) => dayjs(tx.date).year()));
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  // Determine which year to use for data grouping
  const displayYear = activeIndex === 2 ? selectedYear : dayjs().year();

  // -----------------------------
  // Group transactions
  // -----------------------------
  const groupTransactions = useCallback((transactions, type, year) => {
    if (type === "weekly") {
      const grouped = {};
      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        const txYear = date.year();
        const week = date.week();
        const key = `${txYear}-W${week}`;

        if (!grouped[key]) {
          grouped[key] = {
            income: Array(7).fill(0),
            expense: Array(7).fill(0),
            label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          };
        }

        const dayIndex = date.weekday();
        const adjustedDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;

        if (tx.type === "income")
          grouped[key].income[adjustedDayIndex] += tx.amount;
        else grouped[key].expense[adjustedDayIndex] += tx.amount;
      });

      const merged = {
        income: Array(7).fill(0),
        expense: Array(7).fill(0),
        label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      };

      Object.values(grouped).forEach((week) => {
        for (let i = 0; i < 7; i++) {
          merged.income[i] += week.income[i];
          merged.expense[i] += week.expense[i];
        }
      });

      return merged.label.map((day, i) => ({
        label: day,
        income: merged.income[i],
        expense: merged.expense[i]
      }));
    }

    if (type === "monthly") {
      const currentMonth = dayjs().month();
      const currentYear = dayjs().year();
      const grouped = {};

      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        if (date.month() === currentMonth && date.year() === currentYear) {
          const day = date.date();
          if (!grouped[day])
            grouped[day] = { income: 0, expense: 0, label: day.toString() };
          if (tx.type === "income") grouped[day].income += tx.amount;
          else grouped[day].expense += tx.amount;
        }
      });

      const daysInMonth = dayjs().daysInMonth();
      const result = [];
      for (let day = 1; day <= daysInMonth; day++) {
        result.push(
          grouped[day] || { income: 0, expense: 0, label: day.toString() }
        );
      }
      return result;
    }

    if (type === "yearly") {
      const grouped = {};

      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        if (date.year() === year) {
          const month = date.month();
          if (!grouped[month])
            grouped[month] = {
              income: 0,
              expense: 0,
              label: date.format("MMM")
            };
          if (tx.type === "income") grouped[month].income += tx.amount;
          else grouped[month].expense += tx.amount;
        }
      });

      const result = [];
      for (let m = 0; m < 12; m++) {
        result.push(
          grouped[m] || {
            income: 0,
            expense: 0,
            label: dayjs().month(m).format("MMM")
          }
        );
      }
      return result;
    }

    return [];
  }, []);

  const groupedBarData = useMemo(() => {
    const type =
      activeIndex === 0 ? "weekly" : activeIndex === 1 ? "monthly" : "yearly";
    return groupTransactions(transactions, type, displayYear);
  }, [transactions, activeIndex, displayYear, groupTransactions]);

  // Summary for displayed period
  const summary = useMemo(() => {
    let filtered = transactions;

    if (activeIndex === 0) {
      const now = dayjs();
      filtered = transactions.filter((tx) =>
        dayjs(tx.date).isAfter(now.startOf("week"))
      );
    } else if (activeIndex === 1) {
      const now = dayjs();
      filtered = transactions.filter((tx) =>
        dayjs(tx.date).isAfter(now.startOf("month"))
      );
    } else {
      filtered = transactions.filter(
        (tx) => dayjs(tx.date).year() === displayYear
      );
    }

    const totalIncome = filtered
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = filtered
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return { totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [transactions, activeIndex, displayYear]);

  const chartData = useMemo(
    () =>
      groupedBarData.flatMap((d) => [
        {
          value: d.income,
          label: d.label,
          frontColor: "#22c55e",
          spacing: 4
        },
        {
          value: d.expense,
          label: "",
          frontColor: "#ef4444"
        }
      ]),
    [groupedBarData]
  );

  const getFilteredTransactions = () => {
    const now = dayjs();
    if (activeIndex === 0)
      return transactions.filter((tx) =>
        dayjs(tx.date).isAfter(now.startOf("week"))
      );
    if (activeIndex === 1)
      return transactions.filter((tx) =>
        dayjs(tx.date).isAfter(now.startOf("month"))
      );
    return transactions.filter((tx) => dayjs(tx.date).year() === displayYear);
  };

  const formatYAxisLabel = (v) => {
    if (v >= 1_000_000)
      return `${v / 1_000_000 > 0 ? (v / 1_000_000).toFixed(1) : 0}M`;
    if (v >= 1_000) return `${v / 1_000 > 0 ? (v / 1_000).toFixed(1) : 0}k`;
    return `${v}`;
  };

  const rawMax = Math.max(
    ...groupedBarData.flatMap((d) => [d.income, d.expense]),
    100
  );
  const paddedMax = rawMax * 1.2;
  const stepValue = chooseStepValue(paddedMax);
  const noOfSections = 4;
  const roundedMaxValue = stepValue * noOfSections;
  const yAxisLabelTexts = Array.from({ length: noOfSections + 1 }, (_, i) =>
    formatYAxisLabel(stepValue * i)
  );

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

        {/* ------------------- Summary Cards ------------------- */}
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
              onPress={() => setActiveIndex(index)}
              style={{
                flex: 1,
                paddingVertical: 9,
                alignItems: "center",
                borderRadius: 10,
                backgroundColor:
                  activeIndex === index ? "#ffffff" : "transparent",
                shadowColor: activeIndex === index ? "#0ea5e9" : "transparent",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: activeIndex === index ? 2 : 0
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: activeIndex === index ? "700" : "500",
                  color: activeIndex === index ? "#0ea5e9" : "#94a3b8",
                  letterSpacing: 0.2
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Year Navigation - Only show when yearly view is selected */}
        {activeIndex === 2 && availableYears.length > 0 && (
          <View className="flex-row justify-between items-center mt-4 mb-4">
            <TouchableOpacity
              onPress={() =>
                setSelectedYear((prev) => {
                  const idx = availableYears.indexOf(prev);
                  return idx > 0 ? availableYears[idx - 1] : prev;
                })
              }
              disabled={selectedYear === Math.max(...availableYears)}
            >
              <Text
                className={`text-lg font-semibold ${
                  selectedYear === Math.max(...availableYears)
                    ? "text-gray-300"
                    : "text-blue-600"
                }`}
              >
                ← Previous
              </Text>
            </TouchableOpacity>

            <Text className="text-2xl font-bold text-gray-800">
              {selectedYear}
            </Text>

            <TouchableOpacity
              onPress={() =>
                setSelectedYear((prev) => {
                  const idx = availableYears.indexOf(prev);
                  return idx < availableYears.length - 1
                    ? availableYears[idx + 1]
                    : prev;
                })
              }
              disabled={selectedYear === Math.min(...availableYears)}
            >
              <Text
                className={`text-lg font-semibold ${
                  selectedYear === Math.min(...availableYears)
                    ? "text-gray-300"
                    : "text-blue-600"
                }`}
              >
                Next →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="relative flex justify-center items-center mt-6">
          <BarChart
            data={chartData}
            barWidth={14}
            barBorderRadius={6}
            labelWidth={30}
            spacing={22}
            initialSpacing={25}
            noOfSections={noOfSections}
            stepValue={stepValue}
            maxValue={roundedMaxValue}
            isAnimated
            hideRules
            yAxisThickness={0}
            xAxisThickness={0}
            yAxisLabelWidth={55}
            yAxisLabelTexts={yAxisLabelTexts}
            yAxisColor="#e5e7eb"
            xAxisColor="#e5e7eb"
            yAxisTextStyle={{ color: "#6b7280" }}
            xAxisLabelTextStyle={{ color: "#374151", fontSize: 12 }}
            showYAxisIndices={false}
            xAxisLength={280}
          />
        </View>

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
          title="Recent Transactions"
          data={getFilteredTransactions()}
          loading={isLoading}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Statistics;
