import { Stack } from "expo-router";
import "./global.css";
import GlobalProvider from "@/lib/global-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create a client
const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalProvider>
        <Stack screenOptions={{ headerShown: false }}>
          {/* This tells expo-router that the modal should be shown as a modal screen */}
          <Stack.Screen
            name="(modal)/profileModal"
            options={{ presentation: "transparentModal" }}
          />{" "}
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
      </GlobalProvider>
    </QueryClientProvider>
  );
}
