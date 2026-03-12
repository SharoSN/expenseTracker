import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  ActivityIndicator
} from "react-native";
import icons from "@/constants/icons";
import { loginWithEmail, login, getCurrentUser } from "@/lib/appwrite";
import { useGlobalContext } from "@/lib/global-provider";
import { Link, Redirect, useRouter } from "expo-router";
import LottieView from "lottie-react-native";

const SignIn = () => {
  const router = useRouter();
  const { refetch, loading, isLogged } = useGlobalContext();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!loading && isLogged) {
    return <Redirect href="/" />;
  }

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await loginWithEmail({ email, password });
      if (result) {
        await refetch();
        router.replace("/");
      }
    } catch (error: any) {
      Alert.alert("Login Failed", error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
      const result = await login();
      if (result) {
        const user = await getCurrentUser();
        if (!user) {
          Alert.alert(
            "Error",
            "Failed to load your account. Please try again."
          );
          return;
        }
        await refetch();
        router.replace("/");
      }
    } catch (error: any) {
      console.error("Google login error:", error);
      Alert.alert("Login Failed", error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="bg-white h-full flex-1 items-center justify-center p-5">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center"
        }}
        className="w-full max-w-md"
      >
        <View className="items-center mt-10">
          <Text className="text-2xl text-center uppercase text-black-200">
            Welcome To Velora
          </Text>
        </View>

        <Text className="text-lg text-zinc-500 mb-6 text-center">
          Your Personal Finance Assistant{" "}
          <Text className="text-black-1 font-semibold">Reinvented</Text>
        </Text>

        <View>
          <LottieView
            style={{ width: 200, height: 200 }}
            source={require("../assets/animations/animation.json")}
            autoPlay
            loop
          />
        </View>

        <View className="w-full mb-2 p-4">
          <Text className="font-semibold text-black text-base mb-2 text-left">
            Email
          </Text>
          <TextInput
            className="border text-black-1 rounded-lg p-4 text-base"
            placeholder="Enter your email address..."
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View className="w-full mb-6 p-4">
          <Text className="text-black font-semibold text-base mb-2 text-left">
            Password
          </Text>
          <TextInput
            className="border text-black-1 rounded-lg p-4 text-base"
            placeholder="Enter your password..."
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <View className="w-full p-4">
          <TouchableOpacity
            className="border border-gray-500 bg-slate-900 rounded-lg p-3 mt-5 items-center justify-center mb-4"
            onPress={handleEmailLogin}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white text-lg font-semibold">
                Login with email
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center">
          <View className="w-28 h-px bg-slate-300" />
          <View className="mx-2">
            <Text className="text-slate-500 text-xl">Or</Text>
          </View>
          <View className="w-28 h-px bg-slate-300" />
        </View>

        <View className="w-full p-4">
          <TouchableOpacity
            onPress={handleGoogleLogin}
            className="border border-gray-500 bg-slate-900 rounded-lg p-3 mt-5 items-center justify-center mb-4 w-full"
            disabled={isSubmitting}
          >
            <View className="flex flex-row items-center justify-center">
              <Image
                source={icons.google}
                className="w-5 h-5"
                resizeMode="contain"
              />
              <Text className="font-semibold text-lg text-white ml-2">
                Login with Google
              </Text>
            </View>
          </TouchableOpacity>

          <View className="flex flex-col justify-center items-center">
            <Text>Don't have an account?</Text>
            <TouchableOpacity>
              <Link
                className="w-1/2 p-2 text-slate-900 font-bold"
                href="/sign-up"
              >
                Sign Up
              </Link>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SignIn;
