import type React from "react";
import {
  View,
  Text,
  TextInput as RNTextInput,
  Keyboard,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Animated
} from "react-native";
import { ArrowUp, Mic, StopCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forwardRef, useEffect, useRef, useCallback, useState } from "react";
import * as FileSystem from "expo-file-system";
import { useAudioRecorder, setAudioModeAsync, AudioModule } from "expo-audio";
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

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  accent: "#4fc3f7",
  accentDark: "#0ea5c9",
  accentSoft: "rgba(79,195,247,0.10)",
  accentBorder: "rgba(79,195,247,0.30)",
  accentFocus: "rgba(79,195,247,0.55)",
  accentGlow: "#4fc3f7",
  placeholder: "#9ca3af",
  inputBg: "#ffffff",
  red: "#ef4444",
  redSoft: "rgba(239,68,68,0.08)",
  redBorder: "rgba(239,68,68,0.30)"
};

// ─── Recording preset that produces a valid file Whisper accepts ──────────────
// iOS: outputs .wav (pcm_16bit) — universally accepted by Whisper
// Android: outputs .wav as well
const WHISPER_RECORDING_OPTIONS = {
  android: {
    extension: ".wav",
    outputFormat: 6, // ENCODING_PCM_16BIT
    audioEncoder: 3, // AAC — fallback, Android will handle
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000
  },
  ios: {
    extension: ".wav",
    audioQuality: 127, // MAX
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false
  },
  web: {}
};

// ─── Glowing Mic ──────────────────────────────────────────────────────────────
const GlowMicButton = ({
  isRecording,
  disabled,
  onPress,
  recorderReady
}: {
  isRecording: boolean;
  disabled: boolean;
  onPress: () => void;
  recorderReady: boolean;
}) => {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: isRecording ? 500 : 1800,
          useNativeDriver: true
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: isRecording ? 500 : 1800,
          useNativeDriver: true
        })
      ])
    ).start();
  }, [isRecording]);

  const scale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [1, isRecording ? 1.15 : 1.06]
  });
  const shadowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, isRecording ? 0.85 : 0.5]
  });

  if (!recorderReady)
    return (
      <ActivityIndicator
        size="small"
        color={T.accent}
        style={{ marginLeft: 4 }}
      />
    );

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <Animated.View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: isRecording ? T.redSoft : T.accentSoft,
          borderWidth: 1,
          borderColor: isRecording ? T.redBorder : T.accentBorder,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
          shadowColor: isRecording ? T.red : T.accentGlow,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity,
          shadowRadius: 8,
          elevation: 3,
          opacity: disabled ? 0.4 : 1
        }}
      >
        {isRecording ? (
          <StopCircle size={16} color={T.red} strokeWidth={2} />
        ) : (
          <Mic size={16} color={T.accent} strokeWidth={2.5} />
        )}
      </Animated.View>
    </Pressable>
  );
};

// ─── Send Button ──────────────────────────────────────────────────────────────
const SendButton = ({
  loading,
  disabled,
  onPress
}: {
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) => {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!disabled) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true
          }),
          Animated.timing(glow, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      glow.setValue(0);
    }
  }, [disabled]);

  const shadowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.55]
  });

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <Animated.View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: "#ffffff",
          borderWidth: 1.5,
          borderColor: disabled ? "rgba(79,195,247,0.2)" : T.accent,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: T.accentGlow,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity,
          shadowRadius: 12,
          elevation: disabled ? 0 : 5
        }}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={disabled ? T.accent : "#fff"}
          />
        ) : (
          <ArrowUp
            size={20}
            color={disabled ? "rgba(79,195,247,0.3)" : T.accent}
            strokeWidth={2.5}
          />
        )}
      </Animated.View>
    </Pressable>
  );
};

// ─── Upload Progress ──────────────────────────────────────────────────────────
const UploadProgress = ({ progress }: { progress: number }) => (
  <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
    <View
      style={{
        height: 2,
        backgroundColor: "rgba(79,195,247,0.15)",
        borderRadius: 1,
        overflow: "hidden"
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: T.accent,
          borderRadius: 1
        }}
      />
    </View>
    <Text
      style={{
        color: T.accent,
        fontSize: 10,
        textAlign: "center",
        marginTop: 4,
        opacity: 0.7
      }}
    >
      Uploading audio... {progress}%
    </Text>
  </View>
);

// ─── Main ChatInput ───────────────────────────────────────────────────────────
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
    const [isFocused, setIsFocused] = useState(false);

    const [userId, setUserId] = useState<string | null>(null);
    const [recorderReady, setRecorderReady] = useState(false);
    const [isSendingAudio, setIsSendingAudio] = useState(false);
    const [sendingProgress, setSendingProgress] = useState(0);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // FIX 1: Use explicit wav options instead of RecordingPresets.HIGH_QUALITY
    // HIGH_QUALITY on iOS produces CAF format which Whisper rejects.
    const audioRecorder = useAudioRecorder(WHISPER_RECORDING_OPTIONS);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- User init ---
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
          const { granted } =
            await AudioModule.requestRecordingPermissionsAsync();
          if (!granted) {
            Alert.alert(
              "Permission Required",
              "Please grant microphone access in settings."
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
          if (isMounted) setRecorderReady(true);
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

    // --- Recording duration ---
    useEffect(() => {
      if (isRecording) {
        recordingIntervalRef.current = setInterval(() => {
          setRecordingDuration((prev) => prev + 1);
        }, 100);
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

    // FIX 2: Remove the separate { type: "done" } message entirely.
    // The server triggers transcription on isLast: true — that's the only
    // signal it needs. Sending a separate "done" message was causing the
    // server to receive a message type it doesn't handle, and the last
    // chunk's isLast was never being set to true because the loop exits
    // before the final sendMessage call properly flags it.
    const sendAudioWithRetry = useCallback(
      async (base64Audio: string, format: string = "wav") => {
        const CHUNK_SIZE = 65536;
        const MAX_RETRIES = 3;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const totalChunks = Math.ceil(base64Audio.length / CHUNK_SIZE);

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const chunk = base64Audio.slice(start, start + CHUNK_SIZE);
              // FIX: isLast is true ONLY on the very last chunk index
              const isLast = i === totalChunks - 1;

              setSendingProgress(Math.round(((i + 1) / totalChunks) * 100));

              sendMessage({
                type: "audio",
                chunk,
                isLast, // server reads this to trigger transcription
                format,
                userId,
                chunkSize: chunk.length
              });

              // Small delay between chunks to avoid overwhelming the WS buffer
              if (!isLast) await new Promise((r) => setTimeout(r, 50));
            }

            // No separate "done" message needed — isLast:true is the signal
            return true;
          } catch (err) {
            if (attempt < MAX_RETRIES - 1) {
              await new Promise((r) =>
                setTimeout(r, 1000 * Math.pow(2, attempt))
              );
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
        if (isRecording) return;
        setSendingProgress(0);
        await audioRecorder.record();
        setIsRecording(true);
      } catch (err) {
        Alert.alert(
          "Recording Error",
          err instanceof Error ? err.message : "Could not start recording."
        );
        setIsRecording(false);
      }
    }, [audioRecorder, recorderReady, isRecording]);

    const stopRecording = useCallback(async () => {
      if (!isRecording || !userId) return;
      try {
        await audioRecorder.stop();
        setIsRecording(false);
        setIsProcessing(true);

        const uri = audioRecorder.uri;
        if (!uri) {
          Alert.alert("Error", "Failed to get recording URI.");
          setIsProcessing(false);
          return;
        }

        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists) {
          Alert.alert("Error", "Recording file not found.");
          setIsProcessing(false);
          return;
        }

        if (fileInfo.size < 5000) {
          Alert.alert(
            "Recording Too Short",
            "Please record at least 1 second of audio."
          );
          await FileSystem.deleteAsync(uri, { idempotent: true });
          setIsProcessing(false);
          return;
        }

        // FIX 3: Detect actual file extension from the URI so the server
        // saves the temp file with the right extension for Whisper to accept.
        const uriExtension = uri.split(".").pop()?.toLowerCase() || "wav";
        const format = ["m4a", "mp4", "wav", "mp3", "webm", "ogg"].includes(
          uriExtension
        )
          ? uriExtension
          : "wav";

        console.log(
          `🎤 Audio URI: ${uri}, detected format: ${format}, size: ${fileInfo.size}`
        );

        const filePath = uri.startsWith("file://")
          ? uri.replace("file://", "")
          : uri;

        setIsSendingAudio(true);
        const base64Audio = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64
        });

        await sendAudioWithRetry(base64Audio, format);

        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        } catch {}
      } catch (err) {
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
      if (focusOnMount) (ref as React.RefObject<RNTextInput>).current?.focus();
    }, [focusOnMount, ref]);

    useEffect(() => {
      const show = Keyboard.addListener("keyboardDidShow", () =>
        scrollViewRef.current?.scrollToEnd({ animated: true })
      );
      const will = Keyboard.addListener("keyboardWillShow", () =>
        scrollViewRef.current?.scrollToEnd({ animated: true })
      );
      return () => {
        show.remove();
        will.remove();
      };
    }, [scrollViewRef]);

    const isDisabled = loading || isRecording || isSendingAudio || isProcessing;

    return (
      <View style={{ paddingBottom: Platform.OS === "ios" ? 0 : bottom }}>
        {/* Recording indicator */}
        {isRecording && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              backgroundColor: T.redSoft,
              borderWidth: 1,
              borderColor: T.redBorder,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 8
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: T.red
              }}
            />
            <Text style={{ color: T.red, fontSize: 13, fontWeight: "600" }}>
              🎙 Recording {formatDuration(recordingDuration)}
            </Text>
          </View>
        )}

        {/* Processing indicator */}
        {isProcessing && !isSendingAudio && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              backgroundColor: T.accentSoft,
              borderWidth: 1,
              borderColor: T.accentBorder,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 8
            }}
          >
            <ActivityIndicator size="small" color={T.accent} />
            <Text style={{ color: T.accent, fontSize: 13, fontWeight: "500" }}>
              Processing audio...
            </Text>
          </View>
        )}

        {/* Upload progress */}
        {isSendingAudio && <UploadProgress progress={sendingProgress} />}

        {/* Input row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 10,
            paddingHorizontal: 16
          }}
        >
          {/* Text box */}
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "flex-end",
              backgroundColor: T.inputBg,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: isRecording
                ? T.redBorder
                : isFocused
                  ? T.accentFocus
                  : T.accentBorder,
              paddingHorizontal: 16,
              paddingVertical: 10,
              gap: 10,
              shadowColor: isRecording ? T.red : T.accentGlow,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: isFocused || isRecording ? 0.25 : 0.06,
              shadowRadius: isFocused ? 10 : 4,
              elevation: isFocused ? 2 : 1
            }}
          >
            <RNTextInput
              ref={ref}
              placeholder="Ask Velora..."
              placeholderTextColor="#9ca3af"
              value={input}
              onChangeText={onChangeText}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              multiline
              editable={!isRecording && !isSendingAudio}
              style={{
                flex: 1,
                fontSize: 15,
                color: "#111827",
                maxHeight: 120,
                fontFamily: Platform.OS === "ios" ? "System" : "sans-serif"
              }}
            />

            <GlowMicButton
              isRecording={isRecording}
              disabled={isSendingAudio || isProcessing}
              onPress={isRecording ? stopRecording : startRecording}
              recorderReady={recorderReady}
            />
          </View>

          {/* Send */}
          <SendButton
            loading={loading}
            disabled={isDisabled || !input.trim()}
            onPress={() => {
              onSubmit();
              Keyboard.dismiss();
            }}
          />
        </View>
      </View>
    );
  }
);

ChatInput.displayName = "ChatInput";
