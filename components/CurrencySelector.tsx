import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator
} from "react-native";
import React, { useState, useCallback } from "react";
import { refreshExchangeRates } from "@/lib/exchangeRateService";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { CURRENCIES, useWalletStore } from "@/lib/walletStore";

const CurrencySelector = () => {
  const currency = useWalletStore((state) => state.currency);
  const setCurrency = useWalletStore((state) => state.setCurrency);
  const exchangeRates = useWalletStore((state) => state.exchangeRates);
  const [refreshing, setRefreshing] = useState(false);

  const handleCurrencyChange = useCallback(
    (code) => {
      if (currency !== code) {
        setCurrency(code);
        console.log(`✅ Display currency changed to: ${code}`);
      }
    },
    [currency, setCurrency]
  );

  const handleRefreshRates = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshExchangeRates();
      console.log("✅ Exchange rates refreshed");
    } catch (error) {
      console.error("❌ Failed to refresh rates:", error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // ✅ Helper to get exchange rate for a currency
  const getExchangeRate = (currencyCode) => {
    if (currencyCode === "EUR") return 1;
    return exchangeRates[currencyCode] || "N/A";
  };

  return (
    <View className="px-4 py-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-bold text-gray-900">
          Select Display Currency
        </Text>
        <TouchableOpacity
          onPress={handleRefreshRates}
          disabled={refreshing}
          className="p-2"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#1f2937" />
          ) : (
            <MaterialCommunityIcons name="refresh" size={20} color="#1f2937" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3">
          {Object.entries(CURRENCIES).map(([code, config]) => {
            const rate = getExchangeRate(code);
            const rateDisplay =
              code === "EUR"
                ? "Base"
                : typeof rate === "number"
                ? `1 EUR = ${rate.toFixed(3)} ${code}`
                : "Loading...";

            return (
              <TouchableOpacity
                key={code}
                onPress={() => handleCurrencyChange(code)}
                className={`px-4 py-3 rounded-lg border-2 min-w-32 ${
                  currency === code
                    ? "bg-slate-900 border-slate-900"
                    : "bg-white border-gray-200"
                }`}
              >
                <View className="flex-row items-center gap-1">
                  <Text
                    className={`text-2xl font-semibold ${
                      currency === code ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {config.symbol}
                  </Text>
                  <Text
                    className={`font-semibold text-sm ${
                      currency === code ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {code}
                  </Text>
                </View>
                <Text
                  className={`text-xs mt-1 ${
                    currency === code ? "text-gray-200" : "text-gray-600"
                  }`}
                >
                  {config.name}
                </Text>
                <Text
                  className={`text-xs mt-2 font-medium ${
                    currency === code ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {rateDisplay}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export default CurrencySelector;
