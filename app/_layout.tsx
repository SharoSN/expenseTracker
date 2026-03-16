import { Stack } from "expo-router";
import "./global.css";
import GlobalProvider from "@/lib/global-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useEffect } from "react";
import { SocketProvider } from "@/context/SocketContext";

const queryClient = new QueryClient();

export default function RootLayout() {
  const { loading } = useExchangeRates();

  useEffect(() => {
    if (!loading) {
      console.log("✅ Exchange rates initialized");
    }
  }, [loading]);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalProvider>
        <SocketProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="(modal)/profileModal"
              options={{ presentation: "transparentModal" }}
            />
            <Stack.Screen
              name="(modal)/walletModal"
              options={{ presentation: "transparentModal" }}
            />
            <Stack.Screen
              name="(modal)/transactionModal"
              options={{ presentation: "transparentModal" }}
            />
            <Stack.Screen
              name="(modal)/searchModal"
              options={{ presentation: "transparentModal" }}
            />
          </Stack>
        </SocketProvider>
      </GlobalProvider>
    </QueryClientProvider>
  );
}
