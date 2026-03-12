import React, { useState } from "react";
import { View, Text, Pressable, Modal, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

const TransactionDatePicker = ({ transaction, setTransaction }) => {
  const [showPicker, setShowPicker] = useState(false);

  const onChange = (event, selectedDate) => {
    if (Platform.OS === "ios") {
      if (event.type === "dismissed") {
        setShowPicker(false);
        return;
      }
    } else {
      setShowPicker(false);
    }

    if (selectedDate) {
      setTransaction((prev) => ({
        ...prev,
        date: selectedDate
      }));
    }
  };

  const displayDate = transaction?.date
    ? new Date(transaction.date).toLocaleDateString()
    : "Select a date";

  return (
    <View className="mt-4 border border-gray-500 rounded-lg p-4">
      <Pressable onPress={() => setShowPicker(true)}>
        <Text className="text-base text-gray-600">{displayDate}</Text>
      </Pressable>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          className="flex-1 bg-black/40"
          onPress={() => setShowPicker(false)}
        />

        <View className="bg-white rounded-t-2xl p-4 items-center justify-center">
          <DateTimePicker
            value={transaction?.date ? new Date(transaction.date) : new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChange}
            style={{ width: 320, alignSelf: "center" }}
            textColor={Platform.OS === "ios" ? "black" : undefined}
          />
          <Pressable
            onPress={() => setShowPicker(false)}
            className="mt-3 bg-blue-600 px-10 py-3 rounded-xl"
          >
            <Text className="text-white text-lg font-semibold">Done</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
};

export default TransactionDatePicker;
