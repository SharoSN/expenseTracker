// server.js
// A conceptual Node.js WebSocket server demonstrating robust command processing.

import WebSocket, { WebSocketServer } from "ws";
import * as sdk from "node-appwrite";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";

dotenv.config();

// --- Configuration ---
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- Appwrite Setup ---
const client = new sdk.Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

const database = new sdk.Databases(client);

// Config IDs
// Using hardcoded IDs provided by the user to ensure configuration is correct,
// preventing potential issues with environment variable loading or mismatched keys.
const config = {
  userWalletCollectionId: "6820053a001909436a14", // APPWRITE_WALLET_COLLECTION_ID
  userTransactionCollectionId: "683e28b6002b61669545", // APPWRITE_TRANSACTION_COLLECTION_ID
  appwriteDatabaseId: "67ec72cd002e8ca58ead" // APPWRITE_DATABASE_ID
};

// --- OpenAI Setup ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- WebSocket Setup ---
const wss = new WebSocketServer({ host: "0.0.0.0", port: 3000 });
console.log("✅ WebSocket server running on ws://0.0.0.0:3000");

// --- Connection & state ---
const connectedUsers = new Map(); // { userId: Set<ws> }
const pendingAudio = new Map();
// Removed pendingTransactions as structured LLM parsing should make conversation unnecessary

// --- Helpers ---
function sendToUser(userId, data) {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return;
  sockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
  });
}

async function transcribeWithWhisper(chunks, format = "m4a") {
  const filePath = `/tmp/audio_${Date.now()}.${format}`;
  fs.writeFileSync(filePath, Buffer.concat(chunks));

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1"
  });

  fs.unlinkSync(filePath);
  return transcription.text;
}

// --- LLM Utility Function for Structured Parsing ---

/**
 * Calls the Gemini API with structured JSON response configuration and exponential backoff.
 */
async function callLlmApi(prompt, responseSchema, systemInstruction) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema
    },
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    }
  };

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // If the response is a 429 (Too Many Requests), retry logic handles it
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Retrying...");
        }
        const errorBody = await response.text();
        throw new Error(`API error ${response.status}: ${errorBody}`);
      }

      const result = await response.json();
      const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (jsonText) {
        // Return the parsed JavaScript object
        return JSON.parse(jsonText);
      }
      throw new Error("LLM response lacked valid JSON content.");
    } catch (error) {
      if (attempts === maxAttempts - 1) {
        console.error(
          `[ERROR] LLM API failed after ${maxAttempts} attempts.`,
          error.message
        );
        throw error;
      }
      const delay = Math.pow(2, attempts) * 1000 + Math.random() * 1000;
      console.warn(
        `[API] Attempt ${attempts + 1} failed. Retrying in ${Math.round(
          delay
        )}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempts++;
    }
  }
}

// --- AI Advice Fallback ---

/**
 * Calls the general-purpose OpenAI LLM for financial advice or conversational response.
 */
async function getAiAdvice(text, userId) {
  console.log(`[LLM] Falling back to AI advice for text: "${text}"`);
  try {
    const aiReply = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful, concise financial advisor. Assist the user in managing wallets and transactions, or provide brief financial tips."
        },
        { role: "user", content: text }
      ],
      max_tokens: 150
    });

    sendToUser(userId, {
      type: "response",
      text:
        aiReply.choices[0].message?.content ||
        "Sorry, I'm unable to process that request right now."
    });
  } catch (error) {
    console.error(`[ERROR] AI Advice generation failed: ${error.message}`);
    sendToUser(userId, {
      type: "response",
      text: "⚠️ I had trouble connecting to the financial AI for advice."
    });
  }
}

// --- Handle AI financial commands (Refactored Dispatcher) ---

async function handleFinancialCommand(text, userId, ws) {
  // CRITICAL: Normalization before processing
  const lowerText = text.toLowerCase().trim();

  console.log(`[DISPATCHER] Received normalized command: "${lowerText}"`);

  // --- 1. WALLET CRUD (Highest Priority) ---

  // Variable to store the extracted wallet name
  let walletName = null;
  const walletKeywords = /\s+(wallet|account|fund)$/; // Regex to strip keywords from the end

  // 1a. ADD WALLET Command: Capture everything after "add "
  let match = lowerText.match(/^add\s+(.+)/);
  if (match) {
    const potentialName = match[1].trim();
    // Check if the command is NOT clearly a transaction command
    if (
      potentialName &&
      !potentialName.includes("transaction") &&
      !potentialName.includes("income") &&
      !potentialName.includes("expense")
    ) {
      // Remove the keyword (wallet, account, fund) if it's at the end
      walletName = potentialName.replace(walletKeywords, "").trim();
    }
  }

  if (walletName) {
    if (!walletName) {
      sendToUser(userId, {
        type: "response",
        text: "⚠️ Please provide a name for the new wallet."
      });
      return; // Handled
    }
    console.log("💡 Creating wallet:", walletName);
    await createWallet(userId, walletName, ws);
    return; // CRITICAL: Stop execution if command is handled
  }

  // 1b. DELETE WALLET Command: Capture everything after "delete "
  let walletToDeleteName = null;

  match = lowerText.match(/^delete\s+(.+)/);
  if (match) {
    const potentialName = match[1].trim();
    // Check if the command is NOT clearly a transaction command
    if (
      potentialName &&
      !potentialName.includes("transaction") &&
      !potentialName.includes("income") &&
      !potentialName.includes("expense")
    ) {
      // Remove the keyword (wallet, account, fund) if it's at the end
      walletToDeleteName = potentialName.replace(walletKeywords, "").trim();
    }
  }

  if (walletToDeleteName) {
    const name = walletToDeleteName;
    if (!name) {
      sendToUser(userId, {
        type: "response",
        text: "⚠️ Please provide the name of the wallet to delete."
      });
      return; // Handled
    }
    await deleteWallet(userId, name, ws);
    return; // CRITICAL: Stop execution if command is handled
  }

  // --- 2. TRANSACTION COMMANDS (Mid Priority) ---
  // Look for key phrases that indicate a transaction is requested
  if (
    (lowerText.includes("add") ||
      lowerText.includes("log") ||
      lowerText.includes("record")) &&
    (lowerText.includes("transaction") ||
      lowerText.includes("income") ||
      lowerText.includes("expense") ||
      lowerText.includes("for"))
  ) {
    try {
      // Define the schema for structured parsing
      const transactionSchema = {
        type: "OBJECT",
        properties: {
          amount: {
            type: "NUMBER",
            description:
              "The dollar amount of the transaction. MUST be a number."
          },
          walletName: {
            type: "STRING",
            description:
              "The name of the wallet (e.g., Checking, Savings) to which the transaction belongs. Infer from context."
          },
          category: {
            type: "STRING",
            description:
              "The spending category (e.g., Groceries, Rent, Coffee). Infer from context."
          },
          type: {
            type: "STRING",
            description:
              "The type of transaction, must be 'income' or 'expense'. Infer from context."
          },
          description: {
            type: "STRING",
            description: "A brief description of the transaction."
          }
        },
        required: ["amount", "walletName", "category", "type"]
      };

      const systemInstruction =
        "You are a specialized financial parsing agent. Your only job is to extract the transaction details from the user's voice command and return them as a JSON object strictly matching the provided schema. Infer the wallet name and transaction type ('income' or 'expense') if not explicit.";

      const parsedTransaction = await callLlmApi(
        `Parse the following voice command into JSON: "${text}"`,
        transactionSchema,
        systemInstruction
      );

      console.log("[LLM PARSED TRANSACTION]", parsedTransaction);

      // Call the finalization logic with the parsed object
      await finalizeTransaction(ws, parsedTransaction, userId);
      return; // CRITICAL: Stop execution if command is handled
    } catch (error) {
      console.error(`[ERROR] Transaction LLM parsing failed: ${error.message}`);
      sendToUser(userId, {
        type: "response",
        text: "❌ I couldn't understand the details of that transaction. Please make sure you specify the amount, category, and target wallet."
      });
      return; // Handled (with error)
    }
  }

  // --- 3. AI ADVICE (Lowest Priority / Fallback) ---
  // If no structured command matched, send to conversational AI
  await getAiAdvice(text, userId);
}

// --- WebSocket Connection ---
wss.on("connection", (ws) => {
  console.log("🔗 Client connected");

  ws.on("message", async (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      const userId = parsed.userId;
      if (!userId) return;

      // Register connection
      if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
      connectedUsers.get(userId).add(ws);

      switch (parsed.type) {
        case "user_connected":
          sendToUser(userId, { type: "response", text: "✅ User connected" });
          break;

        case "addTransaction":
          // Client-initiated transaction (e.g., from a form submission)
          await finalizeTransaction(ws, parsed, userId);
          break;

        case "audio":
          if (!pendingAudio.has(ws)) {
            pendingAudio.set(ws, {
              chunks: [],
              format: parsed.format || "m4a"
            });
          }
          const pending = pendingAudio.get(ws);
          pending.chunks.push(Buffer.from(parsed.chunk, "base64"));
          break;

        case "done":
          const pendingData = pendingAudio.get(ws);
          pendingAudio.delete(ws);

          if (!pendingData || !pendingData.chunks.length)
            return sendToUser(userId, {
              type: "response",
              text: "⚠️ No audio received"
            });

          const { chunks, format } = pendingData;
          const commandText = await transcribeWithWhisper(chunks, format);
          console.log("🎤 Voice command:", commandText);

          await handleFinancialCommand(commandText, userId, ws);
          break;

        default:
          console.warn("⚠️ Ignored unknown action:", parsed.type);
      }
    } catch (err) {
      console.error("❌ Error handling message:", err);
      ws.send(JSON.stringify({ type: "error", text: "❌ Server error" }));
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    for (const [userId, sockets] of connectedUsers.entries()) {
      sockets.delete(ws);
      if (sockets.size === 0) connectedUsers.delete(userId);
    }
  });
});

// --- Helper: Find Wallet ---
async function findWalletByNameOrId(nameOrId, userId) {
  // CRITICAL CHECK
  if (!config.appwriteDatabaseId || !config.userWalletCollectionId) {
    console.error(
      "❌ Appwrite Configuration Error: Database or Wallet Collection ID is missing."
    );
    return null;
  }

  try {
    const res = await database.listDocuments(
      config.appwriteDatabaseId,
      config.userWalletCollectionId,
      [
        sdk.Query.equal("userId", userId),
        sdk.Query.or([
          sdk.Query.equal("$id", nameOrId),
          sdk.Query.equal("name", nameOrId)
        ])
      ]
    );
    return res.total > 0 ? res.documents[0] : null;
  } catch (err) {
    console.error("❌ Error finding wallet:", err);
    return null;
  }
}

async function createWallet(userId, walletName, ws) {
  // CRITICAL CHECK
  if (!config.appwriteDatabaseId || !config.userWalletCollectionId) {
    const msg = `❌ Configuration Error: Missing Appwrite Database ID (${config.appwriteDatabaseId}) or Wallet Collection ID (${config.userWalletCollectionId}). Check your environment variables.`;
    console.error(msg);
    sendToUser(userId, {
      type: "response",
      text: "❌ Appwrite Configuration Error: Database or Wallet Collection ID is missing."
    });
    return;
  }

  try {
    const existing = await database.listDocuments(
      config.appwriteDatabaseId,
      config.userWalletCollectionId,
      [sdk.Query.equal("userId", userId), sdk.Query.equal("name", walletName)]
    );

    if (existing.total > 0) {
      sendToUser(userId, {
        type: "response",
        text: `⚠️ Wallet "${walletName}" already exists.`
      });
      return;
    }

    const newWallet = await database.createDocument(
      config.appwriteDatabaseId,
      config.userWalletCollectionId,
      sdk.ID.unique(),
      {
        userId,
        name: walletName,
        amount: 0,
        totalIncome: 0,
        totalExpense: 0,
        $permissions: [
          sdk.Permission.read(sdk.Role.user(userId)),
          sdk.Permission.write(sdk.Role.user(userId))
        ]
      }
    );

    sendToUser(userId, {
      type: "response",
      text: `✅ Wallet "${walletName}" created successfully!`
    });

    // Send updated wallet list
    sendToUser(userId, { type: "wallet_created", wallet: newWallet });
  } catch (err) {
    console.error("❌ Error creating wallet:", err);
    sendToUser(userId, {
      type: "response",
      text: "❌ Failed to create wallet. Please try again."
    });
  }
}

// --- Delete Wallet ---
async function deleteWallet(userId, walletName, ws) {
  // CRITICAL CHECK
  if (!config.appwriteDatabaseId || !config.userWalletCollectionId) {
    const msg = `❌ Configuration Error: Missing Appwrite Database ID (${config.appwriteDatabaseId}) or Wallet Collection ID (${config.userWalletCollectionId}). Check your environment variables.`;
    console.error(msg);
    sendToUser(userId, {
      type: "response",
      text: "❌ Appwrite Configuration Error: Database or Wallet Collection ID is missing."
    });
    return;
  }

  try {
    const wallet = await findWalletByNameOrId(walletName, userId);
    if (!wallet) {
      sendToUser(userId, {
        type: "response",
        text: `⚠️ Wallet "${walletName}" not found.`
      });
      return;
    }

    await database.deleteDocument(
      config.appwriteDatabaseId,
      config.userWalletCollectionId,
      wallet.$id
    );

    sendToUser(userId, {
      type: "response",
      text: `🗑️ Wallet "${walletName}" deleted successfully.`
    });

    sendToUser(userId, { type: "wallet_deleted", walletId: wallet.$id });
  } catch (err) {
    console.error("❌ Error deleting wallet:", err);
    sendToUser(userId, {
      type: "response",
      text: "❌ Failed to delete wallet."
    });
  }
}

// --- Finalize Transaction ---
async function finalizeTransaction(ws, parsed, userId) {
  // CRITICAL CHECK
  if (
    !config.appwriteDatabaseId ||
    !config.userWalletCollectionId ||
    !config.userTransactionCollectionId
  ) {
    const msg = `❌ Configuration Error: Missing Appwrite Database or Collection IDs. Check your environment variables.`;
    console.error(msg);
    sendToUser(userId, {
      type: "response",
      text: "❌ Appwrite Configuration Error: Database or Collection IDs are missing."
    });
    return;
  }

  const { amount, category, walletName, description, type } = parsed;

  // Basic validation after LLM parsing
  if (
    !amount ||
    !category ||
    !walletName ||
    !["income", "expense"].includes(type)
  ) {
    sendToUser(userId, {
      type: "response",
      text: `⚠️ Transaction failed: Missing or invalid details (Amount, Category, Wallet, or Type).`
    });
    return;
  }

  // Find or create wallet
  let wallet = await findWalletByNameOrId(walletName, userId);

  // Fallback to the user's latest wallet if the LLM couldn't find a matching name
  if (!wallet) {
    const maybe = await database.listDocuments(
      config.appwriteDatabaseId,
      config.userWalletCollectionId,
      [sdk.Query.equal("userId", userId), sdk.Query.orderDesc("$createdAt")]
    );
    if (maybe.total) {
      wallet = maybe.documents[0];
      sendToUser(userId, {
        type: "response",
        text: `ℹ️ Could not find wallet "${walletName}". Logging to your latest wallet: ${wallet.name}.`
      });
    }
  }

  if (!wallet) {
    sendToUser(userId, {
      type: "response",
      text: `⚠️ No wallet found. Create a wallet first.`
    });
    return;
  }

  // Create transaction
  await database.createDocument(
    config.appwriteDatabaseId,
    config.userTransactionCollectionId,
    sdk.ID.unique(),
    {
      userId,
      type,
      amount: parseFloat(amount), // Ensure amount is stored as a number
      category,
      walletId: wallet.$id,
      date: new Date().toISOString(),
      description: description || `Voice command for ${category}`,
      $permissions: [
        sdk.Permission.read(sdk.Role.user(userId)),
        sdk.Permission.write(sdk.Role.user(userId))
      ]
    }
  );

  // Update wallet balance
  const updates = {};
  const numericAmount = parseFloat(amount);
  if (type === "income")
    updates.totalIncome = (wallet.totalIncome || 0) + numericAmount;
  if (type === "expense")
    updates.totalExpense = (wallet.totalExpense || 0) + numericAmount;
  updates.amount =
    (wallet.amount || 0) + (type === "income" ? numericAmount : -numericAmount);

  const updatedWallet = await database.updateDocument(
    config.appwriteDatabaseId,
    config.userWalletCollectionId,
    wallet.$id,
    updates
  );

  // Notify the user on all devices
  sendToUser(userId, {
    type: "response",
    text: `✅ Transaction of $${numericAmount.toFixed(2)} added to ${
      wallet.name
    } as ${type}.`
  });

  // Real-time wallet update
  sendToUser(userId, {
    type: "wallet_updated",
    wallet: { ...wallet, ...updates }
  });
}
