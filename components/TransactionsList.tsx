import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import React from "react";
import { FlashList } from "@shopify/flash-list";
import {
  TransactionItemProps,
  TransactionListType,
  TransactionType
} from "@/types";
import { expenseCategories, incomeCategory } from "@/constants/data";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { config, storage } from "@/lib/appwrite";

export const TransactionsList = ({
  loading,
  data = [],
  title = "Recent Transactions",
  emptyListMessage = "No transactions found."
}: TransactionListType) => {
  const router = useRouter();

  // Add debugging

  // Validate data before sorting
  const sortedData = React.useMemo(() => {
    if (!Array.isArray(data)) {
      console.warn("TransactionsList: data is not an array", data);
      return [];
    }

    return [...data].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [data]);

  const handleClick = async (item: TransactionType) => {
    console.log("Raw transaction item:", item);

    let imageUrl = null;

    if (item.image) {
      imageUrl = `https://fra.cloud.appwrite.io/v1/storage/buckets/${config.userAvatars}/files/${item.image}/view?project=${config.projectId}`;
    }

    console.log("Final Image URL passed to modal:", imageUrl);

    router.push({
      pathname: "/(modal)/transactionModal",
      params: {
        id: item.$id,
        type: item?.type,
        amount: item?.amount?.toString(),
        category: item?.category,
        date: item?.date,
        description: item?.description,
        uid: item?.uid,
        walletId: item?.walletId
      }
    });
  };

  // Sort transactions by date (newest first)

  return (
    <View className="p-4">
      {title && <Text className="text-xl font-semibold mb-2">{title}</Text>}

      <View className="flex-1">
        <FlashList
          data={sortedData}
          renderItem={({ item, index }: TransactionItemProps) => (
            <TransactionItem
              item={item}
              index={index}
              handleClick={handleClick}
            />
          )}
          estimatedItemSize={60}
          ListEmptyComponent={() =>
            loading ? (
              <View className="flex-1 justify-center items-center mt-6">
                <ActivityIndicator size="large" color="#6366F1" />
                <Text className="text-gray-500 mt-2">Loading...</Text>
              </View>
            ) : (
              <Text className="text-center text-gray-700 mt-4 font-bold">
                {emptyListMessage}
              </Text>
            )
          }
        />
      </View>
    </View>
  );
};

// Helper subcomponent (not exported)
const TransactionItem = ({
  item,
  index,
  handleClick
}: TransactionItemProps) => {
  const categoryKey = item?.category ?? null;

  const category =
    item.type === "income"
      ? incomeCategory
      : categoryKey && expenseCategories[categoryKey]
      ? expenseCategories[categoryKey]
      : {
          label: "Uncategorized",
          icon: DefaultIcon,
          bgColor: "#E2E8F0"
        };

  const IconComponent = category.icon;

  // Custom default icon component - a simple question mark icon
  function DefaultIcon(props: { size: number; color: string }) {
    return (
      <Text
        style={{
          fontSize: props.size,
          color: props.color,
          fontWeight: "bold",
          textAlign: "center",
          lineHeight: props.size
        }}
      >
        ?
      </Text>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100).duration(400)}
      className="p-4 border-b border-gray-200"
    >
      <View className="flex flex-row justify-between items-center">
        <View className="flex flex-row items-center gap-6">
          <TouchableOpacity onPress={() => handleClick(item)}>
            <View
              style={{ backgroundColor: category.bgColor }}
              className="w-12 items-center p-2 rounded-md"
            >
              {IconComponent ? (
                <IconComponent size={30} weight="fill" color="white" />
              ) : (
                <DefaultIcon size={30} color="#718096" />
              )}
            </View>
          </TouchableOpacity>

          <View>
            <Text className="text-lg font-semibold">{category.label}</Text>
            {item.description ? (
              <Text className="text-gray-500 text-sm">{item.description}</Text>
            ) : (
              <Text className="text-gray-600 italic text-sm">
                No details provided
              </Text>
            )}
          </View>
        </View>
        <View className="flex flex-col items-center">
          <Text
            className={`font-semibold ${
              item.type === "income" ? "text-green-600" : "text-red-600"
            }`}
          >
            {item.type === "income" ? "+ $" : "- $"}
            {item.amount}
          </Text>
          <Text className="text-sm text-gray-600">
            {new Date(item.date).toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short"
            })}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};
