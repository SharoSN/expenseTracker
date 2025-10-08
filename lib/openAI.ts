import OpenAI from "openai";
import { saveUserExpense } from "./appwrite";

const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const handleVoiceCommand = async (
  text: string,
  setGptResponse: (response: string) => void,
) => {
  const addIncome = async (amount: number) => {
    console.log(`✅ Income Added: $${amount}`);
    try {
      const incomeDetails = {
        amount,
        category: "Income",
        description: "User's income",
        date: new Date().toISOString(),
      };
      const response = await saveUserExpense(incomeDetails);
      console.log("Income saved in Appwrite:", response);
    } catch (error) {
      console.error("Error saving income:", error);
      throw error; // Re-throw so we know if it fails
    }
  };

  const addExpense = async (amount: number) => {
    console.log(`✅ Expense Recorded: $${amount}`);
    try {
      const expenseDetails = {
        amount,
        category: "Expense",
        description: "User's expense",
        date: new Date().toISOString(),
      };
      const response = await saveUserExpense(expenseDetails);
      console.log("Expense saved in Appwrite:", response);
    } catch (error) {
      console.error("Error saving expense:", error);
      throw error;
    }
  };

  const functionMap: Record<string, (amount: number) => Promise<void>> = {
    add_income: addIncome,
    add_expense: addExpense,
  };

  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            'You are a smart finance assistant. Understand voice commands like "add $500 income" or "record $100 expense" and call the correct function.',
        },
        {
          role: "user",
          content: text,
        },
      ],
      functions: [
        {
          name: "add_income",
          description: "Adds income to the account",
          parameters: {
            type: "object",
            properties: {
              amount: {
                type: "number",
                description: "The amount of income to add in dollars",
              },
            },
            required: ["amount"],
          },
        },
        {
          name: "add_expense",
          description: "Records an expense in the account",
          parameters: {
            type: "object",
            properties: {
              amount: {
                type: "number",
                description: "The amount of expense to record in dollars",
              },
            },
            required: ["amount"],
          },
        },
      ],
      function_call: "auto",
    });

    const choice = gptRes.choices?.[0];

    if (choice?.finish_reason === "function_call") {
      const functionCall = choice.message.function_call;
      console.log("Function to call:", functionCall);

      if (functionCall?.name) {
        const func = functionMap[functionCall.name];
        if (func) {
          const args = JSON.parse(functionCall.arguments || "{}");

          try {
            await func(args.amount);

            // 🪄 After success, send a happy confirmation message
            if (functionCall.name === "add_income") {
              setGptResponse(
                `✅ Successfully added $${args.amount} income! 🎉`,
              );
            } else if (functionCall.name === "add_expense") {
              setGptResponse(
                `✅ Successfully recorded $${args.amount} expense! 🧾`,
              );
            }
          } catch (error) {
            setGptResponse(
              "⚠️ Sorry, something went wrong while saving the data.",
            );
          }
        } else {
          console.warn(
            `⚠️ No matching function found for ${functionCall.name}`,
          );
        }
      }
    } else if (choice?.message?.content) {
      // If GPT just replied with text (not a function call)
      console.log("GPT response:", choice.message.content);
      setGptResponse(choice.message.content);
    }
  } catch (error) {
    console.error("Error handling voice command:", error);
    setGptResponse("⚠️ Sorry, there was an error processing your request.");
  }
};
