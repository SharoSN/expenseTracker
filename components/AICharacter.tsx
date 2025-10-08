import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert, FlatList } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { account } from "@/lib/appwrite";
import { useAppSocket } from "@/hooks/useAppSocket";

const AICharacter = () => {
  const [recording, setRecording] = useState<Audio.Recording | undefined>();
  const [userId, setUserId] = useState<string | null>(null);

  const { wallets, sendMessage } = useAppSocket(userId);

  useEffect(() => {
    const initUser = async () => {
      try {
        const user = await account.get();
        if (user?.$id) setUserId(user.$id);
      } catch (err) {
        console.error("User init failed:", err);
        Alert.alert("Error", "Failed to login or get user");
      }
    };
    initUser();
  }, []);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission not granted");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      console.log("🎙️ Recording started");
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = async () => {
    if (!recording || !userId) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(undefined);

      if (!uri) return;

      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });

      sendMessage({
        type: "audio",
        chunk: base64Audio,
        format: "m4a", // Let the server know the real format
        userId
      });
      sendMessage({ type: "done", userId });

      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <TouchableOpacity
        onPress={recording ? stopRecording : startRecording}
        style={{
          borderWidth: 1,
          borderColor: "#555",
          padding: 15,
          marginBottom: 20,
          borderRadius: 8,
          backgroundColor: recording ? "#f00" : "#222"
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center" }}>
          {recording ? "Stop Recording" : "Start Recording"}
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
        Your Wallets:
      </Text>
      <FlatList
        data={wallets}
        keyExtractor={(item) => item.$id}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 12,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6
            }}
          >
            <Text style={{ fontWeight: "bold" }}>{item.name}</Text>
            <Text>Amount: {item.amount}</Text>
            <Text>Income: {item.totalIncome}</Text>
            <Text>Expense: {item.totalExpense}</Text>
          </View>
        )}
      />
    </View>
  );
};

export default AICharacter;
