// hooks/useExchangeRates.ts
import { useEffect, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  initializeExchangeRates,
  updateExchangeRatesIfNeeded
} from "@/lib/exchangeRateService";

export const useExchangeRates = () => {
  const [loading, setLoading] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );

  // Initialize rates on app startup
  useEffect(() => {
    setLoading(true);
    initializeExchangeRates().finally(() => setLoading(false));
  }, []);

  // Update rates when app comes back from background
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.match(/inactive|background/) && nextAppState === "active") {
      // App has come to foreground
      updateExchangeRatesIfNeeded();
    }
    setAppState(nextAppState);
  };

  return {
    loading,
    appState
  };
};
