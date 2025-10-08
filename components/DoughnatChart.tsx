import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  SafeAreaView,
} from "react-native";
import React, { useState } from "react";
import { PieChart } from "react-native-gifted-charts";

// Helper function to format money correctly
const formatMoney = (value) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const DoughnatChart = () => {
  const blueShades = [
    "#1E3A8A", // Dark blue
    "#3B82F6", // Medium blue
    "#93C5FD", // Light blue
  ];

  const data = [
    {
      value: 1234,
      color: blueShades[0],
      text: "Bank 1", // Name for the first section
    },
    {
      value: 5034,
      color: blueShades[1],
      text: "Bank 2", // Name for the second section
    },
    {
      value: 124,
      color: blueShades[2],
      text: "Bank 3", // Name for the third section
    },
  ];

  const [selectedItem, setSelectedItem] = useState(null); // State to hold selected item
  const [modalVisible, setModalVisible] = useState(false); // State to control the modal visibility

  // Handle pie section press
  const handlePress = (item, index) => {
    setSelectedItem(item); // Set the selected item data
    setModalVisible(true); // Show the modal
  };

  return (
    <SafeAreaView>
      <View>
        <PieChart
          data={data}
          donut={true}
          radius={65}
          innerRadius={30}
          onPress={handlePress} // Add onPress to handle pie section presses
          showText={false} // Disable text labels
          showValuesAsLabels={false} // Disable values as labels
          showTooltip={false} // Disable tooltips
          showExternalLabels={false} // Disable external labels
        />

        {/* Modal to show the selected bank's name and amount */}
        <Modal
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)} // Close the modal on back press
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
            }}
          >
            <View
              style={{
                backgroundColor: "white",
                padding: 20,
                borderRadius: 10,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "bold" }}>
                Selected Bank
              </Text>
              {/* Only show the selected bank name and its value */}
              {selectedItem && (
                <>
                  <Text style={{ marginVertical: 10 }}>
                    {selectedItem.text} {/* Name of the bank */}
                  </Text>
                  <Text>
                    {formatMoney(selectedItem.value)}{" "}
                    {/* Display value with dollar sign */}
                  </Text>
                </>
              )}
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{ color: "blue", marginTop: 20 }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

export default DoughnatChart;
