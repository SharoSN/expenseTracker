import { View, Text, ScrollView } from "react-native";
import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native";
import HeaderBox from "@/components/HeaderBox";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { BarChart } from "react-native-gifted-charts";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import weekday from "dayjs/plugin/weekday";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { account, getUserTransactions } from "@/lib/appwrite";
import Transactionslist from "@/components/TransactisonsList";

const chooseStepValue = (maxValue: any) => {
  const roughStep = maxValue / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));

  const multiples = [1, 2, 5, 10];
  for (let i = 0; i < multiples.length; i++) {
    const step = multiples[i] * magnitude;
    if (step >= roughStep) {
      return step;
    }
  }
  return magnitude * 10;
};

dayjs.extend(isoWeek);
dayjs.extend(weekday);
dayjs.extend(weekOfYear);

const Statistics = () => {
  const [activeIndex, setActiveIndex] = useState(0); // 0 = Weekly, 1 = Monthly, 2 = Yearly
  const [transactions, setTransactions] = useState([]);

  const [loadingTransactions, setLoadingTransactions] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const user = await account.get();
        const uid = user.$id;

        const data = await getUserTransactions(uid);

        setTransactions(data);
      } catch (err) {
        console.error("❌ Failed to fetch user or transactions:", err);
      } finally {
        setLoadingTransactions(false);
      }
    };

    fetchTransactions();
  }, []);

  const groupTransactions = (transactions, type) => {
    if (type === "weekly") {
      // Group by week number + year
      const grouped = {};
      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        const year = date.year();
        const week = date.week(); // week number in year
        const key = `${year}-W${week}`;

        if (!grouped[key]) {
          grouped[key] = {
            income: Array(7).fill(0),
            expense: Array(7).fill(0),
            label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          };
        }

        const dayIndex = date.weekday(); // Sunday=0 ... Saturday=6
        const adjustedDayIndex = dayIndex === 0 ? 6 : dayIndex - 1; // Monday=0 ... Sunday=6

        if (tx.type === "income") {
          grouped[key].income[adjustedDayIndex] += tx.amount;
        } else if (tx.type === "expense") {
          grouped[key].expense[adjustedDayIndex] += tx.amount;
        }
      });

      // Merge all weeks to one week total (sum of incomes and expenses per weekday)
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
      // Current month and year
      const currentMonth = dayjs().month();
      const currentYear = dayjs().year();

      const grouped = {};
      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        if (date.month() === currentMonth && date.year() === currentYear) {
          const day = date.date(); // 1-31
          if (!grouped[day]) {
            grouped[day] = { income: 0, expense: 0, label: day.toString() };
          }
          if (tx.type === "income") grouped[day].income += tx.amount;
          else if (tx.type === "expense") grouped[day].expense += tx.amount;
        }
      });

      const daysInMonth = dayjs().daysInMonth();
      const result = [];
      for (let day = 1; day <= daysInMonth; day++) {
        if (!grouped[day]) {
          result.push({ income: 0, expense: 0, label: day.toString() });
        } else {
          result.push(grouped[day]);
        }
      }
      return result;
    }

    if (type === "yearly") {
      // Current year
      const currentYear = dayjs().year();

      const grouped = {};
      transactions.forEach((tx) => {
        const date = dayjs(tx.date);
        if (date.year() === currentYear) {
          const month = date.month(); // 0-11
          if (!grouped[month]) {
            grouped[month] = {
              income: 0,
              expense: 0,
              label: date.format("MMM")
            };
          }
          if (tx.type === "income") grouped[month].income += tx.amount;
          else if (tx.type === "expense") grouped[month].expense += tx.amount;
        }
      });

      const result = [];
      for (let m = 0; m < 12; m++) {
        if (!grouped[m]) {
          result.push({
            income: 0,
            expense: 0,
            label: dayjs().month(m).format("MMM")
          });
        } else {
          result.push(grouped[m]);
        }
      }
      return result;
    }

    return [];
  };

  const getGroupedData = () => {
    const type =
      activeIndex === 0 ? "weekly" : activeIndex === 1 ? "monthly" : "yearly";
    const grouped = groupTransactions(transactions, type);
    return grouped;
  };

  const groupedBarData = getGroupedData();

  // Prepare chart data
  // For each label, show income and expense bars side by side with spacing
  const chartData = groupedBarData.flatMap((item) => [
    {
      value: item.income,
      label: item.label,
      frontColor: "#10b981",
      spacing: 4
    },

    {
      value: item.expense,
      label: "",
      frontColor: "#ef4444"
    }
  ]);

  const getFilteredTransactions = () => {
    const now = dayjs();
    if (activeIndex === 0) {
      // Weekly
      const startOfWeek = now.startOf("week");
      return transactions.filter((tx) => dayjs(tx.date).isAfter(startOfWeek));
    } else if (activeIndex === 1) {
      // Monthly
      const startOfMonth = now.startOf("month");
      return transactions.filter((tx) => dayjs(tx.date).isAfter(startOfMonth));
    } else {
      // Yearly
      const startOfYear = now.startOf("year");
      return transactions.filter((tx) => dayjs(tx.date).isAfter(startOfYear));
    }
  };

  const formatYAxisLabel = (val) => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
    return `$${val}`;
  };

  // Compute max, steps, and Y-axis labels
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

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="mt-4">
        <View className="flex flex-col items-center">
          <HeaderBox
            type="Statistics"
            title={"Statistics"}
            subtext={"Overview of your income & expenses"}
          />
        </View>

        <ScrollView
          className=" p-6"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          <SegmentedControl
            values={["Weekly", "Monthly", "Yearly"]}
            selectedIndex={activeIndex}
            onChange={(event) => {
              const index = event.nativeEvent.selectedSegmentIndex;
              console.log("📍 Selected tab index:", index);
              setActiveIndex(index);
            }}
          />
          <View className="relative flex justify-center items-center mt-6">
            <BarChart
              data={chartData}
              barWidth={12}
              barBorderRadius={6}
              labelWidth={30}
              spacing={20}
              initialSpacing={25}
              noOfSections={noOfSections}
              maxValue={roundedMaxValue}
              stepValue={stepValue}
              isAnimated
              minHeight={5}
              hideRules
              yAxisLabelPrefix="$"
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
          <View className="flex-row justify-center space-x-6 mt-6 gap-4">
            <View className="flex-row items-center space-x-2 gap-2">
              <View className="w-3 h-3 rounded-full bg-green-500" />
              <Text className="text-gray-700 text-sm">Income</Text>
            </View>
            <View className="flex-row items-center space-x-2 gap-2">
              <View className="w-3 h-3 rounded-full bg-red-500" />
              <Text className="text-gray-700 text-sm">Expense</Text>
            </View>
          </View>
          <View>
            <Transactionslist
              title="Recent Transactions"
              data={getFilteredTransactions()}
              loading={loadingTransactions}
            />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

export default Statistics;
