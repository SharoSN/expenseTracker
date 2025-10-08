import { handleVoiceCommand } from "@/lib/openAI";
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Voice from "react-native-voice";

const VoiceInput = () => {
  const [result, setResult] = useState("");
  const [gptResponse, setGptResponse] = useState("");

  useEffect(() => {
    // Setting up event listeners
    Voice.onSpeechStart = () => {
      console.log("Speech recognition started");
    };

    Voice.onSpeechEnd = () => {
      console.log("Speech recognition ended");
    };

    Voice.onSpeechResults = (e) => {
      // onSpeechResults is fired with the results of the speech recognition
      if (e.value && e.value.length > 0) {
        const spokenText = e.value[0];
        setResult(spokenText);

        // 🔥 NEW: After getting the text, send it to GPT
        handleVoiceCommand(spokenText, setGptResponse);
      }
    };

    Voice.onSpeechPartialResults = (e) => {
      // Handle partial results if needed
      console.log("Partial results:", e.value);
    };

    Voice.onSpeechError = (e) => {
      console.error("Voice Error:", e.error); // Log any errors
    };

    // Cleanup listeners when component unmounts
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startListening = async () => {
    try {
      const available = await Voice.isAvailable();
      if (available) {
        await Voice.start("en-US"); // Start listening in English (en-US)
      } else {
        console.warn("Voice recognition not available");
      }
    } catch (e) {
      console.error("Failed to start:", e);
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop(); // <-- THIS actually stops the recognition
      console.log("Stopped listening");
    } catch (e) {
      console.error("Failed to stop:", e);
    }
  };

  return (
    <View>
      <TouchableOpacity
        onPress={startListening}
        className="bg-black-1 mt-4 p-4 rounded w-full"
      >
        <Text className="text-white text-center">Speak</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={stopListening}
        className="bg-black-1 mt-4 p-4 w-full"
      >
        <Text className="text-white  text-center">Stop</Text>
      </TouchableOpacity>
      <Text>You said: {result}</Text>
      <Text className="">GPT says: {gptResponse}</Text>
    </View>
  );
};

export default VoiceInput;
