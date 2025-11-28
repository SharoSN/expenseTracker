import WebSocket, { WebSocketServer } from "ws";
import { Client, Databases, Query, ID } from "node-appwrite";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";

dotenv.config();

// --- Config ---
const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  OPENAI_API_KEY,
} = process.env;

const CONFIG = {
  dbId: "67ec72cd002e8ca58ead",
  walletCollectionId: "6820053a001909436a14",
  transactionCollectionId: "683e28b6002b61669545",
};

// --- Appwrite Client ---
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

const database = new Databases(client);

// --- OpenAI Client ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- WebSocket Server ---
const wss = new WebSocketServer({ host: "0.0.0.0", port: 3000 });
console.log("✅ WebSocket server running on ws://0.0.0.0:3000");

// --- State ---
const connectedUsers = new Map();
const pendingAudio = new Map();

// --- Helpers ---
function sendToUser(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

async function transcribeAudio(chunks, format = "m4a") {
  const filePath = `/tmp/audio_${Date.now()}.${format}`;
  fs.writeFileSync(filePath, Buffer.concat(chunks));

  const result = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
  });

  fs.unlinkSync(filePath);
  return result.text;
}

// --- AI: Parse command into structured JSON ---
async function parseCommandWithAI(text) {
  console.log("🧠 Parsing:", text);

  const systemPrompt = `
You are a financial assistant. Parse the user's message into a JSON command for wallet management.

Rules:
1. Always output **valid JSON only**. No text or markdown.
2. Wallet names are the words following the command.
3. Be tolerant of capitalization, small typos, and common speech variations:
   - "add wall btc", "make a walley bitcoin", "Add Wallet XRP" → all mean create a wallet
   - "delete wall btc", "remove walley bitcoin" → all mean delete a wallet
4. Commands are case-insensitive.
5. Amounts are numeric, type is either "income" or "expense".

Supported commands:

- Make Wallet:
  - Trigger words: add, create, make, open, new
  - Output: {"action":"create_wallet","name":"<wallet name>"}

- Create Transaction:
  A transaction includes: type (income/expense), amount, category, and optional description.
  MUST detect:
    - Transaction type keywords:
        income, earn, deposit, incoming, plus → "income"
        expense, spend, pay, paid, minus, cost → "expense"
    - Amount: numeric value
    - Wallet name: words after "to wallet" or "in" or default to "main"
    - Category: next word after amount (if available)
    - Description: remaining text after category

  Output:
  {
    "action": "create_transaction",
    "transaction": {
      "walletId": "<wallet name or id>",
      "type": "<income|expense>",
      "amount": <number>,
      "category": "<category>",
      "description": "<optional description>"
    }
  }

Examples:

User: "I earned 200 dollars salary in main wallet"
Output:
{
  "action":"create_transaction",
  "transaction":{
    "walletId":"main",
    "type":"income",
    "amount":200,
    "category":"salary",
    "description":""
  }
}

User: "add expense 20 food"
Output:
{"action":"create_transaction","transaction":{"type":"expense","amount":20,"category":"food","description":""}}

User: "I spent 15 euro taxi"
Output:
{"action":"create_transaction","transaction":{"type":"expense","amount":15,"category":"taxi","description":""}}

- Delete Wallet:
  - Trigger words: delete, remove, erase, drop, destroy
  - Output: {"action":"delete_wallet","name":"<wallet name>"}

- Unknown:
  - If command cannot be understood: {"action":"unknown"}

Examples:

User: "add wallet btc"
Output: {"action":"create_wallet","name":"btc"}

User: "what's my balance?"
Output: {"action":"unknown"}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0,
  });

  try {
    const aiText = response.choices[0]?.message?.content?.trim();
    const parsed = JSON.parse(aiText);
    console.log("✅ Parsed Command:", parsed);
    return parsed;
  } catch (err) {
    console.warn("❌ Invalid AI JSON:", err.message);
    return { action: "unknown" };
  }
}

// --- AI: Generate helpful response for unknown commands ---
async function getAIHelpfulResponse(text) {
  console.log("🧠 Generating helpful response for:", text);

  const systemPrompt = `
You are a friendly and helpful financial assistant. The user said something you didn't understand.
Instead of saying "I don't understand", respond in a natural and conversational way.
Keep your response to 1-2 sentences.

Your main capabilities are:
- Creating and deleting wallets
- Recording income and expense transactions

Example user messages and your desired responses:
- User: "what's my balance?"
  - You: "I can't check balances yet, but I can help you add a transaction or create a new wallet."
- User: "hello there"
  - You: "Hello! How can I help you with your finances today? You can ask me to create a wallet or record a transaction."
- User: "can you tell me the weather"
  - You: "I'm a financial assistant, so I can't check the weather. I can help with managing your wallets and transactions."
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.7,
  });

  const aiText = response.choices[0]?.message?.content?.trim();
  console.log("✅ AI helpful response:", aiText);
  return aiText || "I'm not sure how to help with that, but I can assist with creating wallets and recording transactions.";
}

// --- CRUD Helpers ---
async function findWallet(userId, name) {
  const normalized = name.trim().toLowerCase();
  const res = await database.listDocuments(CONFIG.dbId, CONFIG.walletCollectionId, [
    Query.equal("userId", userId),
    Query.equal("name_lower", normalized),
  ]);
  return res.documents[0] || null;
}

async function getWalletId(userId, walletName) {
  if (!walletName) walletName = "main";
  const wallet = await findWallet(userId, walletName);
  if (!wallet) throw new Error(`Wallet "${walletName}" not found`);
  return wallet.$id;
}

async function createWallet(userId, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Wallet name cannot be empty");

  const existing = await findWallet(userId, trimmed);
  if (existing) return existing;

  const wallet = await database.createDocument(CONFIG.dbId, CONFIG.walletCollectionId, ID.unique(), {
    userId,
    name: trimmed,
    name_lower: trimmed.toLowerCase(),
    amount: 0,
    totalIncome: 0,
    totalExpense: 0,
  });

  console.log("💾 Wallet created:", wallet.name);
  return wallet;
}

const deleteTransaction = async (transactionId) => {
  try {
    const transaction = await database.getDocument(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      transactionId,
    );

    if (!transaction) {
      return false;
    }

    await database.deleteDocument(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      transactionId
    );
    return true;
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return false;
  }
};

async function deleteWallet(userId, name) {
  const wallet = await findWallet(userId, name);
  if (!wallet) return null;

  const transactions = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.transactionCollectionId,
    [Query.equal("walletId", wallet.$id)],
  );

  for (const transaction of transactions.documents) {
    await deleteTransaction(transaction.$id);
  }

  await database.deleteDocument(CONFIG.dbId, CONFIG.walletCollectionId, wallet.$id);
  console.log("🗑️ Wallet deleted:", wallet.name);
  return wallet.$id;
}

async function createTransaction(userId, data) {
  const transaction = await database.createDocument(CONFIG.dbId, CONFIG.transactionCollectionId, ID.unique(), {
    uid: userId,
    walletId: data.walletId,
    type: data.type,
    amount: data.amount,
    date: data.date || new Date().toISOString(),
    category: data.category || null,
    description: data.description || null,
    image: data.image || null,
  });

  return transaction;
}

async function updateWalletTotals(userId, walletId, transaction) {
  const walletDoc = await database.getDocument(CONFIG.dbId, CONFIG.walletCollectionId, walletId);
  if (!walletDoc) throw new Error("Wallet not found");

  let { amount = 0, totalIncome = 0, totalExpense = 0 } = walletDoc;

  if (transaction.type === "income") {
    totalIncome += transaction.amount;
    amount += transaction.amount;
  } else if (transaction.type === "expense") {
    totalExpense += transaction.amount;
    amount -= transaction.amount;
  }

  const updatedWallet = await database.updateDocument(CONFIG.dbId, CONFIG.walletCollectionId, walletId, {
    amount,
    totalIncome,
    totalExpense,
  });

  console.log(`💰 Wallet updated: ${updatedWallet.name}`, updatedWallet);
  return updatedWallet;
}

// --- WebSocket Events ---
wss.on("connection", (ws) => {
  console.log("🔗 Client connected");

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return sendToUser(ws, { type: "error", text: "Invalid JSON" });
    }

    const userId = data.userId;
    if (!userId) return sendToUser(ws, { type: "error", text: "Missing userId" });
    connectedUsers.set(ws, userId);

    try {
      // ---- Handle text command ----
      if (data.type === "text") {
        const command = await parseCommandWithAI(data.text);
        if (!command || command.action === "unknown") {
          const helpfulResponse = await getAIHelpfulResponse(data.text);
          return sendToUser(ws, { type: "response", text: helpfulResponse });
        }

        if (command.action === "create_wallet") {
          const wallet = await createWallet(userId, command.name);
          sendToUser(ws, { type: "wallet_created", wallet });
          sendToUser(ws, { type: "response", text: `I have created the ${wallet.name} wallet for you.` });

        } else if (command.action === "delete_wallet") {
          const deletedId = await deleteWallet(userId, command.name);
          if (deletedId) {
            sendToUser(ws, { type: "wallet_deleted", walletId: deletedId });
            sendToUser(ws, { type: "response", text: "I have deleted the wallet." });
          } else {
            sendToUser(ws, { type: "response", text: "❌ Wallet not found" });
          }

        } else if (command.action === "create_transaction") {
          const transactionInfo = command.transaction;
          const walletName = transactionInfo.walletId;
          const walletId = await getWalletId(userId, walletName || "main");

          transactionInfo.walletId = walletId;

          const transaction = await createTransaction(userId, transactionInfo);
          const updatedWallet = await updateWalletTotals(userId, walletId, transactionInfo);

          sendToUser(ws, { type: "transaction_created", transaction });
          sendToUser(ws, { type: "wallet_updated", wallet: updatedWallet });
          sendToUser(ws, { type: "response", text: "I have created the transaction." });
        }

        // ---- Handle audio chunks ----
      } else if (data.type === "audio") {
        // Initialize audio buffer for this connection if it doesn't exist
        if (!pendingAudio.has(ws)) {
          pendingAudio.set(ws, { chunks: [], format: data.format || "m4a" });
        }
        // Add chunk to buffer
        pendingAudio.get(ws).chunks.push(Buffer.from(data.chunk, "base64"));
        console.log(`📦 Audio chunk received (total: ${pendingAudio.get(ws).chunks.length})`);

        // ---- Handle done (finish recording) ----
      } else if (data.type === "done") {
        const pending = pendingAudio.get(ws);
        if (!pending || pending.chunks.length === 0) {
          return sendToUser(ws, { type: "response", text: "No audio received" });
        }

        pendingAudio.delete(ws);
        const text = await transcribeAudio(pending.chunks, pending.format);
        console.log("🎤 Transcribed:", text);

        // Send transcribed text to user
        sendToUser(ws, { type: "response", text: `🎤 You said: "${text}"` });

        // Now process the transcribed text as a command
        const command = await parseCommandWithAI(text);

        if (!command || command.action === "unknown") {
          const helpfulResponse = await getAIHelpfulResponse(text);
          sendToUser(ws, { type: "response", text: helpfulResponse });
          return;
        }

        if (command.action === "create_wallet") {
          const wallet = await createWallet(userId, command.name);
          sendToUser(ws, { type: "wallet_created", wallet });
          sendToUser(ws, { type: "response", text: `I have created the ${wallet.name} wallet for you.` });

        } else if (command.action === "delete_wallet") {
          const deletedId = await deleteWallet(userId, command.name);
          if (deletedId) {
            sendToUser(ws, { type: "wallet_deleted", walletId: deletedId });
            sendToUser(ws, { type: "response", text: "I have deleted the wallet." });
          } else {
            sendToUser(ws, { type: "response", text: "❌ Wallet not found" });
          }

        } else if (command.action === "create_transaction") {
          const transactionInfo = command.transaction;
          const walletName = transactionInfo.walletId;
          const walletId = await getWalletId(userId, walletName || "main");

          transactionInfo.walletId = walletId;

          const transaction = await createTransaction(userId, transactionInfo);
          const updatedWallet = await updateWalletTotals(userId, walletId, transactionInfo);

          sendToUser(ws, { type: "transaction_created", transaction });
          sendToUser(ws, { type: "wallet_updated", wallet: updatedWallet });
          sendToUser(ws, { type: "response", text: "I have created the transaction." });
        }
      }
    } catch (err) {
      console.error("Error processing message:", err);
      sendToUser(ws, { type: "error", text: err instanceof Error ? err.message : "An error occurred" });
    }
  });

  ws.on("close", () => {
    connectedUsers.delete(ws);
    console.log("❌ Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});
