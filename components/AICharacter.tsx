import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Animatable from "react-native-animatable";
import ConfettiCannon from "react-native-confetti-cannon";
import LottieView from "lottie-react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  AudioModule,
  useAudioRecorderState,
} from "expo-audio";
import { useAppSocket } from "@/hooks/useAppSocket";
import { account } from "@/lib/appwrite";

const AICharacter: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isWalletAdding, setIsWalletAdding] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [recorderReady, setRecorderReady] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const recordingBtnRef = useRef<any>(null);
  const confettiRef = useRef<any>(null);
  const walletAnimationRef = useRef<LottieView>(null);
  const loadingMoneyRef = useRef<LottieView>(null);

  const {
    sendMessage,
    animationTrigger,
    triggerAnimation,
    clearAnimationTrigger,
  } = useAppSocket(userId);

  // --- Audio setup ---
  useEffect(() => {
    (async () => {
      try {
        const { granted } =
          await AudioModule.requestRecordingPermissionsAsync();
        if (!granted) {
          Alert.alert("Permission Required", "Please grant microphone access.");
          return;
        }

        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
        await audioRecorder.prepareToRecordAsync();
        setRecorderReady(true);
        console.log("🎧 Recorder ready");
      } catch (err) {
        console.error("Audio setup failed:", err);
      }
    })();
  }, [audioRecorder]);

  // --- User initialization ---
  useEffect(() => {
    const initUser = async () => {
      try {
        const user = await account.get();
        if (user?.$id) setUserId(user.$id);
      } catch (err) {
        console.error("User init failed:", err);
      } finally {
        setIsLoadingUser(false);
      }
    };
    initUser();
  }, []);

  // --- Animation triggers ---
  useEffect(() => {
    if (animationTrigger === "wallet_adding") {
      setIsWalletLoading(true);
      setIsWalletAdding(false);
    }

    if (animationTrigger === "wallet_added") {
      setIsWalletLoading(false);
      setTimeout(() => setIsWalletAdding(true), 300);

      setShowConfetti(true);
      const walletTimeout = setTimeout(() => setIsWalletAdding(false), 1500);
      const confettiTimeout = setTimeout(() => setShowConfetti(false), 2000);

      clearAnimationTrigger?.();

      return () => {
        clearTimeout(walletTimeout);
        clearTimeout(confettiTimeout);
      };
    }

    const timeout = setTimeout(() => setIsWalletLoading(false), 2000);
    clearAnimationTrigger?.();
    return () => clearTimeout(timeout);
  }, [animationTrigger, clearAnimationTrigger]);

  // --- Recording handlers ---
  const startRecording = useCallback(async () => {
    try {
      if (!recorderReady) {
        Alert.alert(
          "Recorder Not Ready",
          "Please wait until the recorder is ready.",
        );
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      console.log("🎙️ Recording started");
    } catch (err) {
      console.error("Failed to start recording:", err);
      Alert.alert("Recording Error", "Could not start recording.");
    }
  }, [audioRecorder, recorderReady]);

  const stopRecording = useCallback(async () => {
    if (!recorderState.isRecording || !userId) return;

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) return;

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists || fileInfo.size < 5000) {
        console.log("🎧 No significant audio detected — skipping send.");
        await FileSystem.deleteAsync(uri, { idempotent: true });
        return;
      }

      const filePath = uri.startsWith("file://")
        ? uri.replace("file://", "")
        : uri;
      const base64Audio = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      triggerAnimation("wallet_adding");

      console.log("🎧 Sending audio to server:", {
        userId,
        size: base64Audio.length,
        format: "m4a",
      });
      sendMessage({ type: "audio", chunk: base64Audio, format: "m4a" });
      sendMessage({ type: "done" });

      await FileSystem.deleteAsync(filePath, { idempotent: true });
    } catch (err) {
      console.error("Failed to stop recording:", err);
      Alert.alert("Recording Error", "Could not process audio.");
    }
  }, [
    audioRecorder,
    recorderState.isRecording,
    userId,
    sendMessage,
    triggerAnimation,
  ]);

  const isRecording = recorderState.isRecording;

  return (
    <View className="flex-1 w-full bg-white justify-center items-center relative">
      {showConfetti && (
        <ConfettiCannon
          ref={confettiRef}
          count={80}
          origin={{ x: -10, y: 0 }}
          fadeOut
          explosionSpeed={500}
        />
      )}

      {(isWalletLoading || isWalletAdding) && (
        <View className="absolute inset-0 justify-center items-center z-0">
          <Animatable.View
            animation="fadeIn"
            duration={500}
            className="items-center"
          >
            <LottieView
              ref={isWalletLoading ? loadingMoneyRef : walletAnimationRef}
              style={{ width: 220, height: 220 }}
              source={
                isWalletLoading
                  ? require("../assets/animations/Money.json")
                  : require("../assets/animations/Wallet.json")
              }
              autoPlay
              loop={isWalletLoading}
              speed={isWalletLoading ? 1 : 0.6}
            />
            {isWalletLoading && (
              <Text className="text-indigo-600 font-semibold mt-3 text-center text-base">
                {animationTrigger === "wallet_deleting"
                  ? "Deleting Wallet..."
                  : "Adding wallet..."}
              </Text>
            )}
          </Animatable.View>
        </View>
      )}

      <View className="absolute bottom-16 right-8 z-10">
        <Animatable.View
          ref={recordingBtnRef}
          animation={isRecording ? "pulse" : undefined}
          iterationCount={isRecording ? "infinite" : 1}
          duration={800}
        >
          <TouchableOpacity
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.8}
            className={`p-4 rounded-full shadow-2xl ${isRecording ? "bg-red-500" : "bg-indigo-600"}`}
            disabled={isLoadingUser || !userId || !recorderReady}
          >
            {!recorderReady || isLoadingUser ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={isRecording ? "stop-circle" : "sparkles-outline"}
                size={32}
                color="#fff"
              />
            )}
          </TouchableOpacity>
        </Animatable.View>
      </View>

      {isLoadingUser && (
        <View className="absolute inset-0 bg-white/90 justify-center items-center z-20">
          <ActivityIndicator size="large" color="#6366f1" />
          <Text className="mt-3 text-indigo-600 text-base font-bold">
            Loading User Data...
          </Text>
        </View>
      )}
    </View>
  );
};

export default AICharacter;
