import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Animated
} from "react-native";
import React, { useEffect, useRef } from "react";
import {
  TransactionItemProps,
  TransactionListType,
  TransactionType
} from "@/types";
import { expenseCategories, incomeCategory } from "@/constants/data";
import { useRouter } from "expo-router";
import { config } from "@/lib/appwrite";
import { formatCurrency, useWalletStore } from "@/lib/walletStore";

// ─── Default icon defined at TOP LEVEL ───────────────────────────────────────
const DefaultIcon = ({ size, color }: { size: number; color: string }) => (
  <Text
    style={{
      fontSize: size,
      color,
      fontWeight: "bold",
      textAlign: "center",
      lineHeight: size
    }}
  >
    ?
  </Text>
);

// ─── Transaction Item ─────────────────────────────────────────────────────────
const TransactionItem = ({
  item,
  index,
  handleClick
}: TransactionItemProps) => {
  const currency = useWalletStore((state) => state.currency);
  const categoryKey = item?.category ?? null;

  // Fade-in animation using built-in Animated (works on physical devices)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true
      })
    ]).start();
  }, []);

  const category =
    item.type === "income"
      ? incomeCategory
      : categoryKey && expenseCategories[categoryKey]
        ? expenseCategories[categoryKey]
        : { label: "Uncategorized", icon: DefaultIcon, bgColor: "#E2E8F0" };

  const IconComponent = category.icon || DefaultIcon;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: translateAnim }],
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9"
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        {/* Left side - Icon + Text */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flex: 1,
            marginRight: 8
          }}
        >
          <TouchableOpacity onPress={() => handleClick(item)}>
            <View
              style={{
                backgroundColor: category.bgColor,
                width: 48,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                marginRight: 10
              }}
            >
              <IconComponent size={26} weight="fill" color="white" />
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 15, fontWeight: "600", color: "#0f172a" }}
              numberOfLines={1}
            >
              {category.label}
            </Text>
            <Text style={{ fontSize: 13, color: "#94a3b8" }} numberOfLines={1}>
              {item.description || "No details provided"}
            </Text>
          </View>
        </View>

        {/* Right side - Amount + Date */}
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontWeight: "600",
              fontSize: 14,
              color: item.type === "income" ? "#10b981" : "#f43f5e"
            }}
          >
            {item.type === "income" ? "+ " : "- "}
            {formatCurrency(item.amount, currency)}
          </Text>
          <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
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

// ─── Transactions List ────────────────────────────────────────────────────────
export const TransactionsList = ({
  loading,
  data = [],
  title = "Recent Transactions",
  emptyListMessage = "No transactions found."
}: TransactionListType) => {
  const router = useRouter();

  const sortedData = React.useMemo(() => {
    if (!Array.isArray(data)) return [];
    return [...data].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [data]);

  const handleClick = (item: TransactionType) => {
    let imageUrl = null;
    if (item.image) {
      imageUrl = `https://fra.cloud.appwrite.io/v1/storage/buckets/${config.userAvatars}/files/${item.image}/view?project=${config.projectId}`;
    }

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
        walletId: item?.walletId,
        ...(imageUrl && { imageUrl })
      }
    });
  };

  if (loading) {
    return (
      <View style={{ padding: 16 }}>
        {title && (
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
            {title}
          </Text>
        )}
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={{ color: "#94a3b8", marginTop: 8 }}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      {title && (
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 12,
            color: "#0f172a"
          }}
        >
          {title}
        </Text>
      )}

      {sortedData.length === 0 ? (
        <Text style={{ textAlign: "center", color: "#94a3b8", marginTop: 16 }}>
          {emptyListMessage}
        </Text>
      ) : (
        sortedData.map((item, index) => (
          <TransactionItem
            key={item.$id || index}
            item={item}
            index={index}
            handleClick={handleClick}
          />
        ))
      )}
    </View>
  );
};
