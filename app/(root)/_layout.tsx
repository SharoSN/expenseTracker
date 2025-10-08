import { Redirect, Slot, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useGlobalContext } from "@/lib/global-provider";

export default function AppLayout() {
  const { loading, isLogged } = useGlobalContext();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for the app to be ready before routing
    setIsReady(true);
  }, []);

  // While loading OR until app is ready, show loading screen
  if (loading || !isReady) {
    return (
      <SafeAreaView className="bg-white h-full flex justify-center items-center">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  // If not logged in, redirect to sign-in
  if (!isLogged) {
    return <Redirect href="/sign-in" />;
  }

  // Otherwise, show the app layout
  return <Slot />;
}
