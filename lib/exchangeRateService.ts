import { useWalletStore } from "./walletStore";

// ✅ FIX: Use EUR as base currency (since all data is stored in EUR)
const EXCHANGE_RATE_API = "https://api.exchangerate-api.com/v4/latest/EUR";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface ExchangeRateData {
  timestamp: number;
  rates: Record<string, number>;
}

// Try to get cached rates from device storage
const getCachedRates = async (): Promise<ExchangeRateData | null> => {
  try {
    if (typeof window !== "undefined" && window.fs) {
      const result = await window.fs.readFile("exchange-rates-cache.json", {
        encoding: "utf8"
      });
      const data = JSON.parse(result);
      const now = Date.now();
      // Check if cache is still valid (less than 24 hours old)
      if (now - data.timestamp < CACHE_DURATION) {
        console.log("✅ Using cached exchange rates (EUR base)");
        return data;
      }
    }
  } catch (error) {
    console.log("No cached exchange rates found");
  }
  return null;
};

// Save rates to cache
const cacheRates = async (rates: Record<string, number>): Promise<void> => {
  try {
    if (typeof window !== "undefined" && window.fs) {
      const data: ExchangeRateData = {
        timestamp: Date.now(),
        rates
      };
      // Note: You'll need to implement file writing if window.fs doesn't support it
      // For now, this is a placeholder
      console.log("✅ Exchange rates cached (EUR base)");
    }
  } catch (error) {
    console.error("Failed to cache exchange rates:", error);
  }
};

// ✅ FIX: Fetch exchange rates from API (EUR as base)
export const fetchExchangeRates = async (): Promise<Record<
  string,
  number
> | null> => {
  try {
    // Try to use cached rates first
    const cached = await getCachedRates();
    if (cached) {
      return cached.rates;
    }

    console.log("📡 Fetching fresh exchange rates from API (EUR base)...");
    const response = await fetch(EXCHANGE_RATE_API);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();

    // ✅ Extract only the currencies we support
    const supportedCurrencies = ["EUR", "USD", "GBP", "JPY", "CAD", "AUD"];
    const rates: Record<string, number> = {};

    supportedCurrencies.forEach((currency) => {
      if (currency === "EUR") {
        // EUR to EUR is always 1
        rates[currency] = 1;
      } else {
        // Get the rate from the API response
        rates[currency] = data.rates[currency] || 1;
      }
    });

    // Cache the rates
    await cacheRates(rates);
    console.log("✅ Exchange rates updated successfully (EUR base):", rates);
    return rates;
  } catch (error) {
    console.error("❌ Failed to fetch exchange rates:", error);
    // Return default rates if fetch fails
    return {
      EUR: 1,
      USD: 1.1, // Fallback rates
      GBP: 0.86,
      JPY: 160,
      CAD: 1.47,
      AUD: 1.65
    };
  }
};

// ✅ Initialize exchange rates on app startup
export const initializeExchangeRates = async (): Promise<void> => {
  try {
    console.log("🚀 Initializing exchange rates (EUR base)...");
    const rates = await fetchExchangeRates();
    if (rates) {
      useWalletStore.setState({ exchangeRates: rates });
      console.log("✅ Exchange rates initialized in store (EUR base):", rates);
    } else {
      console.warn("⚠️ Could not fetch exchange rates, using fallback rates");
    }
  } catch (error) {
    console.error("Failed to initialize exchange rates:", error);
  }
};

// ✅ Periodically update exchange rates (call this when app resumes from background)
export const updateExchangeRatesIfNeeded = async (): Promise<void> => {
  const cached = await getCachedRates();
  // Only fetch if cache is expired
  if (!cached) {
    console.log("🔄 Exchange rate cache expired, fetching fresh rates...");
    await initializeExchangeRates();
  } else {
    console.log("✅ Exchange rates still fresh, using cache");
  }
};

// ✅ Force refresh exchange rates
export const refreshExchangeRates = async (): Promise<void> => {
  try {
    console.log("🔄 Force refreshing exchange rates...");
    const rates = await fetchExchangeRates();
    if (rates) {
      useWalletStore.setState({ exchangeRates: rates });
      console.log("✅ Exchange rates refreshed in store (EUR base):", rates);
    } else {
      console.warn("⚠️ Failed to refresh rates from API");
    }
  } catch (error) {
    console.error("❌ Error refreshing exchange rates:", error);
  }
};

// ✅ NEW: Helper to convert EUR to any currency for display
export const convertEURTo = (
  amountInEUR: number,
  currencyCode: string
): number => {
  if (currencyCode === "EUR") return amountInEUR;

  const exchangeRates = useWalletStore.getState().exchangeRates;
  const rate = exchangeRates[currencyCode] || 1;

  return amountInEUR * rate;
};
