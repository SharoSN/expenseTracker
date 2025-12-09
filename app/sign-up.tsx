import {
  Alert,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator
} from "react-native";
import React, { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Input } from "@/~/components/ui/input";
import { account, createUserAccount } from "@/lib/appwrite"; // Make sure this is correct
import { useRouter } from "expo-router";
import { useGlobalContext } from "@/lib/global-provider";

const SignUp = () => {
  const { refetch } = useGlobalContext();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState<number | null>(null);

  const handleChange = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const enforceRateLimit = async () => {
    const now = Date.now();
    if (lastRequestTime && now - lastRequestTime < 1000) {
      const delay = 1000 - (now - lastRequestTime);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };

  const safeAppwriteCall = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      await enforceRateLimit();
      setLastRequestTime(Date.now());
      return await fn();
    } catch (error) {
      console.error("Appwrite call failed:", error);
      throw error;
    }
  };

  const handleSignUp = useCallback(async () => {
    if (loading) return;

    if (!form.email || !form.password || !form.firstName || !form.lastName) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      // Delete existing session if any
      try {
        await account.deleteSession("current");
        console.log("Existing session deleted.");
      } catch (sessionError) {
        console.log(
          "No active session to delete or error deleting session:",
          sessionError
        );
      }

      // Create user account and get session
      const { session } = await safeAppwriteCall(() => createUserAccount(form));
      console.log("✅ Account created and logged in successfully", session);

      // Double-check session by fetching user
      const currentUser = await safeAppwriteCall(() => account.get());

      if (currentUser && currentUser.$id) {
        await refetch();
        router.replace({
          pathname: "/",
          params: {
            signedIn: "true",
            timestamp: Date.now().toString()
          }
        });

        return;
      }

      // If somehow no user returned after creation
      Alert.alert(
        "Session Issue",
        "Account was created but session could not be verified. Please log in manually.",
        [{ text: "OK", onPress: () => router.replace("/sign-in") }]
      );
    } catch (error) {
      console.error("❌ Signup error:", error);

      if (error instanceof Error) {
        const message = error.message.toLowerCase();

        if (message.includes("rate limit") || message.includes("429")) {
          Alert.alert("Too Many Requests", "Please wait and try again", [
            { text: "OK" }
          ]);
          return;
        }

        if (
          message.includes("already exists") ||
          message.includes("user_already_exists")
        ) {
          Alert.alert("Error", "This email is already registered");
          return;
        }

        if (message.includes("session")) {
          Alert.alert(
            "Session Error",
            "Please try again after signing out manually.",
            [{ text: "OK", onPress: () => router.replace("/sign-in") }]
          );
          return;
        }
      }

      Alert.alert("Error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [form, loading, router, lastRequestTime, refetch]);

  return (
    <SafeAreaView className="bg-white h-full">
      <View className="px-6 mt-8 space-y-4">
        <View className="items-center mb-6">
          <Text className="text-2xl font-bold text-gray-900">
            Create Account
          </Text>
        </View>

        {["firstName", "lastName", "email", "password"].map((field) => (
          <View key={field}>
            <Text className="text-sm font-medium text-gray-700 mb-1">
              {field === "firstName"
                ? "First Name"
                : field === "lastName"
                ? "Last Name"
                : field === "email"
                ? "Email"
                : "Password"}
            </Text>
            <Input
              value={form[field]}
              onChangeText={(text) => handleChange(field, text)}
              placeholder={
                field === "firstName"
                  ? "John"
                  : field === "lastName"
                  ? "Doe"
                  : field === "email"
                  ? "your@email.com"
                  : "••••••••"
              }
              secureTextEntry={field === "password"}
              keyboardType={field === "email" ? "email-address" : "default"}
              autoCapitalize="none"
              editable={!loading}
              className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 h-14"
            />
          </View>
        ))}

        <TouchableOpacity
          onPress={handleSignUp}
          disabled={loading}
          className={`mt-6 py-3 rounded-lg items-center ${
            loading ? "bg-slate-900" : "bg-slate-900"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold">Create Account</Text>
          )}
        </TouchableOpacity>

        <View className="flex-row justify-center mt-4">
          <Text className="text-gray-600">Already have an account? </Text>
          <TouchableOpacity
            onPress={() => router.replace("/sign-in")}
            disabled={loading}
          >
            <Text
              className={`font-semibold ${
                loading ? "text-gray-400" : "text-slate-900"
              }`}
            >
              Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default SignUp;
