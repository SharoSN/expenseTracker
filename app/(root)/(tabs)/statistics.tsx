
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
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

  const { data: transactions = [], isLoading, refetch } = useTransactionData();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // -----------------------------
  // Group transactions
  // -----------------------------
  const groupTransactions = useCallback((transactions, type) => {
    if (type === "weekly") {
      const grouped = {};
      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        const year = date.year();
        const week = date.week();
        const key = `${year}-W${week}`;

        if (!grouped[key]) {
          grouped[key] = {
            income: Array(7).fill(0),
            expense: Array(7).fill(0),
            label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          };
        }

        const dayIndex = date.weekday();
        const adjustedDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;

        if (tx.type === "income") grouped[key].income[adjustedDayIndex] += tx.amount;
        else grouped[key].expense[adjustedDayIndex] += tx.amount;
      });

      const merged = {
        income: Array(7).fill(0),
        expense: Array(7).fill(0),
        label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
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
        expense: merged.expense[i],
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
          if (!grouped[day]) grouped[day] = { income: 0, expense: 0, label: day.toString() };
          if (tx.type === "income") grouped[day].income += tx.amount;
          else grouped[day].expense += tx.amount;
        }
      });

      const daysInMonth = dayjs().daysInMonth();
      const result = [];
      for (let day = 1; day <= daysInMonth; day++) {
        result.push(grouped[day] || { income: 0, expense: 0, label: day.toString() });
      }
      return result;
    }

    if (type === "yearly") {
      const currentYear = dayjs().year();
      const grouped = {};

      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        if (date.year() === currentYear) {
          const month = date.month();
          if (!grouped[month]) grouped[month] = { income: 0, expense: 0, label: date.format("MMM") };
          if (tx.type === "income") grouped[month].income += tx.amount;
          else grouped[month].expense += tx.amount;
        }
      });

      const result = [];
      for (let m = 0; m < 12; m++) {
        result.push(grouped[m] || { income: 0, expense: 0, label: dayjs().month(m).format("MMM") });
      }
      return result;
    }

    return [];
  }, []);

  const groupedBarData = useMemo(() => {
    const type = activeIndex === 0 ? "weekly" : activeIndex === 1 ? "monthly" : "yearly";
    return groupTransactions(transactions, type);
  }, [transactions, activeIndex, groupTransactions]);

  // -----------------------------
  // Summary Cards
  // -----------------------------
  const summary = useMemo(() => {
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return { totalIncome, totalExpense, net: totalIncome - totalExpense };
  }, [transactions]);

  const chartData = useMemo(
    () =>
      groupedBarData.flatMap((d) => [
        {
          value: d.income,
          label: d.label,
          frontColor: "#22c55e",
          spacing: 4,
        },
        {
          value: d.expense,
          label: "",
          frontColor: "#ef4444",
        },
      ]),
    [groupedBarData]
  );

  const getFilteredTransactions = () => {
    const now = dayjs();
    if (activeIndex === 0) return transactions.filter((tx) => dayjs(tx.date).isAfter(now.startOf("week")));
    if (activeIndex === 1) return transactions.filter((tx) => dayjs(tx.date).isAfter(now.startOf("month")));
    return transactions.filter((tx) => dayjs(tx.date).isAfter(now.startOf("year")));
  };

  const formatYAxisLabel = (v) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
    return `$${v}`;
  };

  const rawMax = Math.max(...groupedBarData.flatMap((d) => [d.income, d.expense]), 100);
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <HeaderBox type="Statistics" title="Statistics" subtext="Overview of your income & expenses" />

        {/* ------------------- Summary Cards ------------------- */}
        <View className="flex-row justify-between mt-4 mb-4">
          <View className="flex-1 bg-green-100 p-4 rounded-xl mr-2">
            <Text className="text-green-700 font-bold">Income</Text>
            <Text className="text-green-800 text-xl font-bold">${summary.totalIncome.toLocaleString()}</Text>
          </View>
          <View className="flex-1 bg-red-100 p-4 rounded-xl mr-2">
            <Text className="text-red-700 font-bold">Expense</Text>
            <Text className="text-red-800 text-xl font-bold">${summary.totalExpense.toLocaleString()}</Text>
          </View>
          <View className="flex-1 bg-blue-100 p-4 rounded-xl">
            <Text className="text-blue-700 font-bold">Net</Text>
            <Text className="text-blue-800 text-xl font-bold">${summary.net.toLocaleString()}</Text>
          </View>
        </View>

        <SegmentedControl
          values={["Weekly", "Monthly", "Yearly"]}
          selectedIndex={activeIndex}
          onChange={(e) => setActiveIndex(e.nativeEvent.selectedSegmentIndex)}
        />

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

        <TransactionsList title="Recent Transactions" data={getFilteredTransactions()} loading={isLoading} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default Statistics;

