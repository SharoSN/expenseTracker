import { Redirect, Slot } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGlobalContext } from "@/lib/global-provider";

export default function AppLayout() {
  const { loading, isLogged } = useGlobalContext();
  const [isReady, setIsReady] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  // Monitor isLogged changes and redirect if logged out
  useEffect(() => {
    if (isReady && !isLogged && !loading) {
      setShouldRedirect(true);
    }
  }, [isLogged, loading, isReady]);

  if (loading || !isReady) {
    return (
      <SafeAreaView className="bg-white h-full flex justify-center items-center">
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!isLogged || shouldRedirect) {
    return <Redirect href="/sign-in" />;
  }

  return <Slot />;
}
