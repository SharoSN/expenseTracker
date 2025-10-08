import { useState } from "react";
import { Button, Text, TouchableOpacity } from "react-native";
import { saveUserExpense } from "@/lib/appwrite"; // Ensure this function is imported correctly
import { useGlobalContext } from "@/lib/global-provider";

const TestExpense = () => {
  const { user } = useGlobalContext(); // Get the current logged-in user
  const [status, setStatus] = useState(""); // To store success/error message

  const handleExpense = async () => {
    if (!user || !user.$id) {
      setStatus("No user logged in. Please log in first.");
      return;
    }

    const testExpense = {
      amount: 25.99,
      category: "Entertainment",
      description: "Netflix",
      date: new Date().toISOString(),
      userId: user.$id, // Use the logged-in user's ID
    };

    try {
      const response = await saveUserExpense(testExpense); // Call the function to save the expense
      setStatus(`Expense saved successfully: ${JSON.stringify(response)}`);
    } catch (error) {
      console.error("Failed to save expense:", error);
      setStatus("Failed to save expense. Check console for details.");
    }
  };

  return (
    <>
      <TouchableOpacity className="bg-black-1 p-4" onPress={handleExpense}>
        <Text>Save expense</Text>
      </TouchableOpacity>

      <Text>{status && <Text>{status}</Text>}</Text>
    </>
  );
};

export default TestExpense;
