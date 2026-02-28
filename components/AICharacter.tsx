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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forwardRef, useEffect, useRef, useCallback, useState } from "react";
import * as FileSystem from "expo-file-system";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  AudioModule
} from "expo-audio";
import { account } from "@/lib/appwrite";

type Props = {
  input: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  scrollViewRef: React.RefObject<ScrollView>;
  focusOnMount?: boolean;
  loading?: boolean;
  sendMessage: (data: any) => void;
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
      sendMessage
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
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      let isMounted = true;

      (async () => {
        try {
          console.log("🎧 Requesting recording permissions...");
          const { granted } =
            await AudioModule.requestRecordingPermissionsAsync();

          if (!granted) {
            console.warn("⚠️ Microphone permission denied");
            Alert.alert(
              "Permission Required",
              "Please grant microphone access in settings."
            );
            return;
          }

          console.log("✅ Permission granted, setting audio mode...");
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
            interruptionMode: "mixWithOthers",
            shouldPlayInBackground: false
          });

          console.log("✅ Audio mode set, preparing recorder...");
          await audioRecorder.prepareToRecordAsync();

          if (isMounted) {
            setRecorderReady(true);
            console.log("✅ Recorder ready");
          }
        } catch (err) {
          console.error("❌ Audio setup failed:", err);
          Alert.alert(
            "Audio Setup Error",
            "Failed to initialize audio recorder. Please restart the app."
          );
        }
      })();

      return () => {
        isMounted = false;
      };
    }, [audioRecorder]);

    // --- Recording duration tracker ---
    useEffect(() => {
      if (isRecording) {
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration((prev) => prev + 1);
        }, 100);

        // 5 minute timeout
        recordingTimeoutRef.current = setTimeout(() => {
          stopRecording();
          Alert.alert(
            "Recording Limit",
            "Maximum recording time (5 min) reached."
          );
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
    }, [isRecording]);

    const formatDuration = (tenths: number) => {
      const totalSeconds = Math.floor(tenths / 10);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const sendAudioWithRetry = useCallback(
      async (base64Audio: string, format: string = "m4a") => {
        const CHUNK_SIZE = 65536;
        const MAX_RETRIES = 3;

        console.log(`📊 Total audio size: ${base64Audio.length} chars`);
        console.log(
          `📊 Number of chunks: ${Math.ceil(base64Audio.length / CHUNK_SIZE)}`
        );

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            console.log(
              `📤 Sending audio (attempt ${attempt + 1}/${MAX_RETRIES})`
            );

            for (let i = 0; i < base64Audio.length; i += CHUNK_SIZE) {
              const chunk = base64Audio.slice(i, i + CHUNK_SIZE);
              const isLast = i + CHUNK_SIZE >= base64Audio.length;
              const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;

              setSendingProgress(
                Math.round(((i + CHUNK_SIZE) / base64Audio.length) * 100)
              );

              console.log(
                `📤 Chunk ${chunkNumber} - Size: ${chunk.length}, IsLast: ${isLast}`
              );

              sendMessage({
                type: "audio",
                chunk,
                isLast,
                format,
                userId,
                chunkSize: chunk.length
              });

              await new Promise((r) => setTimeout(r, 50));
            }

            // ✅ IMPORTANT: Send "done" not "audio_done" to match backend
            sendMessage({ type: "done", userId });
            console.log("✅ All audio chunks sent successfully");
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
      [sendMessage, userId]
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

        if (isRecording) {
          console.warn("Already recording");
          return;
        }

        console.log("🎙️ Starting recording...");
        setSendingProgress(0);

        await audioRecorder.record();
        setIsRecording(true);

        console.log("✅ Recording started");
      } catch (err) {
        console.error("❌ Failed to start recording:", err);
        Alert.alert(
          "Recording Error",
          err instanceof Error ? err.message : "Could not start recording."
        );
        setIsRecording(false);
      }
    }, [audioRecorder, recorderReady, isRecording]);

    const stopRecording = useCallback(async () => {
      if (!isRecording || !userId) {
        console.warn("Not recording or no userId");
        return;
      }

      try {
        console.log("⏹️ Stopping recording...");
        await audioRecorder.stop();
        setIsRecording(false);
        setIsProcessing(true);

        const uri = audioRecorder.uri;
        console.log("Recording URI:", uri);

        if (!uri) {
          Alert.alert("Error", "Failed to get recording URI.");
          setIsProcessing(false);
          return;
        }

        const fileInfo = await FileSystem.getInfoAsync(uri);
        console.log("File info:", fileInfo);

        if (!fileInfo.exists) {
          Alert.alert("Error", "Recording file not found.");
          setIsProcessing(false);
          return;
        }

        if (fileInfo.size < 5000) {
          console.log("🎧 Recording too short — skipping send.");
          Alert.alert(
            "Recording Too Short",
            "Please record at least 1 second of audio."
          );
          await FileSystem.deleteAsync(uri, { idempotent: true });
          setIsProcessing(false);
          return;
        }

        const filePath = uri.startsWith("file://")
          ? uri.replace("file://", "")
          : uri;

        setIsSendingAudio(true);
        console.log("🎧 Converting to base64...");

        const base64Audio = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64
        });

        console.log("🎧 Sending audio to server...");
        await sendAudioWithRetry(base64Audio, "m4a");

        // Cleanup
        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        } catch (cleanupErr) {
          console.warn("Could not delete temp file:", cleanupErr);
        }

        // NO ALERT - just silently complete
        console.log("✅ Audio sent successfully");
      } catch (err) {
        console.error("❌ Failed to stop recording:", err);
        Alert.alert(
          "Recording Error",
          err instanceof Error ? err.message : "Could not process audio."
        );
      } finally {
        setIsSendingAudio(false);
        setIsProcessing(false);
        setSendingProgress(0);
      }
    }, [audioRecorder, isRecording, userId, sendAudioWithRetry]);

    useEffect(() => {
      if (focusOnMount) {
        (ref as React.RefObject<RNTextInput>).current?.focus();
      }
    }, [focusOnMount, ref]);

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

    return (
      <KeyboardAvoidingView>
        <View>
          {/* Recording indicator */}
          {isRecording && (
            <View className="mx-6 mb-2 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 flex-row items-center gap-2">
              <View className="w-2 h-2 bg-red-500 rounded-full" />
              <RNTextInput
                editable={false}
                className="text-red-600 dark:text-red-400 text-sm font-semibold"
              >
                🎙️ Recording... {formatDuration(recordingDuration)}
              </RNTextInput>
            </View>
          )}

          {/* Processing indicator */}
          {isProcessing && !isSendingAudio && (
            <View className="mx-6 mb-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#3b82f6" />
              <RNTextInput
                editable={false}
                className="text-blue-600 dark:text-blue-400 text-sm font-semibold"
              >
                Processing audio...
              </RNTextInput>
            </View>
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
              <RNTextInput
                editable={false}
                className="text-gray-600 dark:text-gray-400 text-xs mt-1 text-center"
              >
                Uploading... {sendingProgress}%
              </RNTextInput>
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
              <Pressable
                onPress={isRecording ? stopRecording : startRecording}
                disabled={!recorderReady || isSendingAudio || isProcessing}
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
                        opacity={
                          !recorderReady || isSendingAudio || isProcessing
                            ? 0.5
                            : 1
                        }
                      />
                    ) : (
                      <Mic
                        size={20}
                        color="black"
                        strokeWidth={2}
                        opacity={
                          !recorderReady || isSendingAudio || isProcessing
                            ? 0.5
                            : 1
                        }
                      />
                    )}
                  </>
                )}
              </Pressable>
            </View>

            {/* Send Button */}
            <Pressable
              onPress={() => {
                onSubmit();
                Keyboard.dismiss();
              }}
              disabled={
                loading || isRecording || isSendingAudio || isProcessing
              }
            >
              <View
                className={`border bg-black-1 rounded-full p-2 ${
                  loading || isRecording || isSendingAudio || isProcessing
                    ? "opacity-50"
                    : ""
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
        </View>
      </KeyboardAvoidingView>
    );
  }
);

ChatInput.displayName = "ChatInput";
