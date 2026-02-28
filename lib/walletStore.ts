import { create } from "zustand";

// ✅ Currency configuration - EUR is default, but all currencies available for DISPLAY
export const CURRENCIES = {
  EUR: { code: "EUR", symbol: "€", name: "Euro" },
  USD: { code: "USD", symbol: "$", name: "US Dollar" },
  GBP: { code: "GBP", symbol: "£", name: "British Pound" },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar" }
};

// ✅ Define the state structure — no WebSocket here, that lives in useAppSocket.ts
interface WalletState {
  wallets: any[];
  transactions: any[];
  currency: string;
  exchangeRates: Record<string, number>;
  setCurrency: (currency: string) => void;
  setExchangeRates: (rates: Record<string, number>) => void;
  setWallets: (wallets: any[]) => void;
  setTransactions: (transactions: any[]) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  // Initial state
  wallets: [],
  transactions: [],
  currency: "EUR",
  exchangeRates: {},

  // Actions
  setCurrency: (currency) => {
    if (CURRENCIES[currency]) {
      set({ currency });
      console.log(`💱 Display currency changed to: ${currency}`);
    } else {
      console.warn(`❌ Unsupported currency: ${currency}`);
    }
  },

  setExchangeRates: (rates) => set({ exchangeRates: rates }),

  setWallets: (wallets) => set({ wallets }),

  setTransactions: (transactions) => set({ transactions })
}));

// ✅ Format EUR amount to selected display currency
export const formatCurrency = (
  amountInEUR: number | string | null | undefined,
  currencyCode = "EUR"
): string => {
  if (amountInEUR === null || amountInEUR === undefined) {
    return `${CURRENCIES[currencyCode]?.symbol || "€"}0.00`;
  }

  const currencyConfig = CURRENCIES[currencyCode];
  if (!currencyConfig) {
    return `€${parseFloat(String(amountInEUR)).toFixed(2)}`;
  }

  const eurAmount = parseFloat(String(amountInEUR)) || 0;
  const exchangeRates = useWalletStore.getState().exchangeRates;
  const exchangeRate = exchangeRates[currencyCode] || 1;
  const convertedAmount = eurAmount * exchangeRate;

  const localeMap: Record<string, string> = {
    EUR: "de-DE",
    USD: "en-US",
    GBP: "en-GB",
    JPY: "ja-JP",
    CAD: "en-CA",
    AUD: "en-AU"
  };

  const locale = localeMap[currencyCode] || "de-DE";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(convertedAmount);
};

// ✅ Format EUR amount (always EUR regardless of display setting)
export const formatEUR = (amount: number | string): string => {
  const parsed = parseFloat(String(amount)) || 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parsed);
};

// ✅ Format amount in selected display currency
export const formatInDisplayCurrency = (
  amountInEUR: number | string
): string => {
  const displayCurrency = useWalletStore.getState().currency;
  return formatCurrency(amountInEUR, displayCurrency);
};

// ✅ Format amount only (no currency symbol)
export const formatEURAmount = (amount: number | string): string => {
  const parsed = parseFloat(String(amount)) || 0;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parsed);
};

// ✅ Get currency config
export const useCurrency = () => {
  const currency = useWalletStore((state) => state.currency);
  return CURRENCIES[currency] || CURRENCIES.EUR;
};

// ✅ Get EUR symbol
export const getEURSymbol = (): string => "€";
