import type React from "react";
import {
  View,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Keyboard,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert
} from "react-native";
import { ArrowUp, Mic, StopCircle } from "lucide-react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forwardRef, useEffect, useRef, useCallback, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Animatable from "react-native-animatable";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  AudioModule,
  useAudioRecorderState
} from "expo-audio";
import { account } from "@/lib/appwrite";

type Props = {
  input: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  scrollViewRef: React.RefObject<ScrollView>;
  focusOnMount?: boolean;
  loading?: boolean;
  sendMessage: (data: any) => void; // ← Add this prop
};

export const ChatInput = forwardRef<RNTextInput, Props>(
  (
    {
      input,
      onChangeText,
      onSubmit,
      scrollViewRef,
      focusOnMount = false,
      loading = false,
      sendMessage // ← Add this
    },
    ref
  ) => {
    const { bottom } = useSafeAreaInsets();

    // Audio recording state
    const [userId, setUserId] = useState<string | null>(null);
    const [recorderReady, setRecorderReady] = useState(false);
    const [isSendingAudio, setIsSendingAudio] = useState(false);
    const [sendingProgress, setSendingProgress] = useState(0);
    const [recordingDuration, setRecordingDuration] = useState(0);

    const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recorderState = useAudioRecorderState(audioRecorder);

    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const micBtnRef = useRef<any>(null);

    // --- User initialization ---
    useEffect(() => {
      const initUser = async () => {
        try {
          const user = await account.get();
          if (user?.$id) setUserId(user.$id);
        } catch (err) {
          console.error("User init failed:", err);
        }
      };
      initUser();
    }, []);

    // --- Audio setup ---
    useEffect(() => {
      (async () => {
        try {
          const { granted } =
            await AudioModule.requestRecordingPermissionsAsync();
          if (!granted) {
            Alert.alert(
              "Permission Required",
              "Please grant microphone access."
            );
            return;
          }

          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
            interruptionMode: "mixWithOthers",
            shouldPlayInBackground: false
          });
          await audioRecorder.prepareToRecordAsync();
          setRecorderReady(true);
          console.log("🎧 Recorder ready");
        } catch (err) {
          console.error("Audio setup failed:", err);
        }
      })();
    }, [audioRecorder]);

    // --- Recording duration tracker ---
    useEffect(() => {
      if (recorderState.isRecording) {
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration((prev) => prev + 1);
        }, 100);

        // 5 minute timeout
        recordingTimeoutRef.current = setTimeout(() => {
          stopRecording();
          Alert.alert("Recording Limit", "Maximum recording time reached.");
        }, 300000);
      } else {
        if (recordingIntervalRef.current)
          clearInterval(recordingIntervalRef.current);
        if (recordingTimeoutRef.current)
          clearTimeout(recordingTimeoutRef.current);
        setRecordingDuration(0);
      }

      return () => {
        if (recordingIntervalRef.current)
          clearInterval(recordingIntervalRef.current);
        if (recordingTimeoutRef.current)
          clearTimeout(recordingTimeoutRef.current);
      };
    }, [recorderState.isRecording]);

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 10);
      const secs = seconds % 10;
      return `${mins}:${secs}`;
    };

    const sendAudioWithRetry = useCallback(
      async (base64Audio: string, format: string = "m4a") => {
        const CHUNK_SIZE = 65536;
        const MAX_RETRIES = 3;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            console.log(
              `📤 Sending audio (attempt ${attempt + 1}/${MAX_RETRIES})`
            );

            for (let i = 0; i < base64Audio.length; i += CHUNK_SIZE) {
              const chunk = base64Audio.slice(i, i + CHUNK_SIZE);
              const isLast = i + CHUNK_SIZE >= base64Audio.length;

              setSendingProgress(
                Math.round(((i + CHUNK_SIZE) / base64Audio.length) * 100)
              );

              sendMessage({
                type: "audio",
                chunk,
                isLast,
                format
              });

              await new Promise((r) => setTimeout(r, 50));
            }

            sendMessage({ type: "done" });
            console.log("✅ Audio sent successfully");
            return true;
          } catch (err) {
            console.error(`❌ Attempt ${attempt + 1} failed:`, err);

            if (attempt < MAX_RETRIES - 1) {
              const delayMs = 1000 * Math.pow(2, attempt);
              await new Promise((r) => setTimeout(r, delayMs));
            }
          }
        }

        throw new Error("Failed to send audio after multiple attempts");
      },
      [sendMessage]
    );

    const startRecording = useCallback(async () => {
      try {
        if (!recorderReady) {
          Alert.alert(
            "Recorder Not Ready",
            "Please wait until the recorder is ready."
          );
          return;
        }

        setSendingProgress(0);
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        console.log("🎙️ Recording started");

        if (micBtnRef.current) {
          micBtnRef.current.pulse(800);
        }
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
        if (!uri) {
          Alert.alert("Error", "Failed to get recording URI.");
          return;
        }

        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists) {
          Alert.alert("Error", "Recording file not found.");
          return;
        }

        if (fileInfo.size < 5000) {
          console.log("🎧 Recording too short — skipping send.");
          Alert.alert(
            "Recording Too Short",
            "Please record at least 1 second of audio."
          );
          await FileSystem.deleteAsync(uri, { idempotent: true });
          return;
        }

        const filePath = uri.startsWith("file://")
          ? uri.replace("file://", "")
          : uri;

        setIsSendingAudio(true);

        const base64Audio = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64
        });

        console.log("🎧 Sending audio to server");
        await sendAudioWithRetry(base64Audio, "m4a");

        await FileSystem.deleteAsync(filePath, { idempotent: true });
      } catch (err) {
        console.error("Failed to stop recording:", err);
        Alert.alert(
          "Recording Error",
          err instanceof Error ? err.message : "Could not process audio."
        );
      } finally {
        setIsSendingAudio(false);
        setSendingProgress(0);
      }
    }, [audioRecorder, recorderState.isRecording, userId, sendAudioWithRetry]);

    useEffect(() => {
      if (focusOnMount) {
        (ref as React.RefObject<RNTextInput>).current?.focus();
      }
    }, [focusOnMount]);

    useEffect(() => {
      const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
      const focusSubscription = Keyboard.addListener("keyboardWillShow", () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
      return () => {
        showSubscription.remove();
        focusSubscription.remove();
      };
    }, [scrollViewRef]);

    const isRecording = recorderState.isRecording;

    return (
      <KeyboardAvoidingView>
        <Animated.View>
          {/* Recording indicator */}
          {isRecording && (
            <Animatable.View
              animation="fadeIn"
              className="mx-6 mb-2 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 flex-row items-center gap-2"
            >
              <View className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <Animatable.Text
                animation="pulse"
                iterationCount="infinite"
                className="text-red-600 dark:text-red-400 text-sm font-semibold"
              >
                🎙️ Recording... {formatDuration(recordingDuration)}
              </Animatable.Text>
            </Animatable.View>
          )}

          {/* Upload progress */}
          {isSendingAudio && (
            <View className="mx-6 mb-2">
              <View className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <View
                  className="bg-indigo-600 h-full"
                  style={{ width: `${sendingProgress}%` }}
                />
              </View>
              <Animatable.Text className="text-gray-600 dark:text-gray-400 text-xs mt-1 text-center">
                Uploading... {sendingProgress}%
              </Animatable.Text>
            </View>
          )}

          <View className="flex-row items-end gap-2 px-6">
            <View className="flex-1 flex-row items-end bg-gray-100 dark:bg-gray-200 rounded-2xl px-4 py-3">
              <RNTextInput
                ref={ref}
                placeholder="Message"
                value={input}
                onChangeText={onChangeText}
                multiline
                editable={!isRecording && !isSendingAudio}
                className="flex-1 text-base text-black dark:text-black placeholder-gray-400"
                placeholderTextColor="#D1D5DB"
              />

              {/* Mic Button - Inside Input Box */}
              <Animatable.View
                ref={micBtnRef}
                animation={isRecording ? "pulse" : undefined}
                iterationCount={isRecording ? "infinite" : 1}
                duration={800}
              >
                <Pressable
                  onPress={isRecording ? stopRecording : startRecording}
                  disabled={!recorderReady || isSendingAudio}
                  className="ml-2"
                >
                  {!recorderReady ? (
                    <ActivityIndicator size="small" color="#6366f1" />
                  ) : (
                    <>
                      {isRecording ? (
                        <StopCircle
                          size={20}
                          color="#ef4444"
                          strokeWidth={2}
                          opacity={!recorderReady || isSendingAudio ? 0.5 : 1}
                        />
                      ) : (
                        <Mic
                          size={20}
                          color="black"
                          strokeWidth={2}
                          opacity={!recorderReady || isSendingAudio ? 0.5 : 1}
                        />
                      )}
                    </>
                  )}
                </Pressable>
              </Animatable.View>
            </View>

            {/* Send Button */}
            <Pressable
              onPress={() => {
                onSubmit();
                Keyboard.dismiss();
              }}
              disabled={loading || isRecording || isSendingAudio}
            >
              <View
                className={`border bg-black-1 rounded-full p-2 ${
                  loading || isRecording || isSendingAudio ? "opacity-50" : ""
                }`}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ArrowUp size={24} color="#fff" />
                )}
              </View>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    );
  }
);

ChatInput.displayName = "ChatInput";
