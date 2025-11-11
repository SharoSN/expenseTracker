import WebSocket, { WebSocketServer } from "ws";
import { Client, Databases, Query, ID, Permission, Role } from "node-appwrite";
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
You are a financial assistant. Parse the user's message into a JSON command.
Support:
1️⃣ Create wallet → {"action":"create_wallet","name":"Wallet Name"}
2️⃣ Delete wallet → {"action":"delete_wallet","name":"Wallet Name"}
If unsure, respond with {"action":"unknown"}.
Return valid JSON only.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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

// --- CRUD Helpers ---
async function findWallet(userId, name) {
  const normalized = name.trim().toLowerCase();
  const res = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    [Query.equal("userId", userId), Query.equal("name_lower", normalized)],
  );
  return res.documents[0] || null;
}

async function createWallet(userId, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Wallet name cannot be empty");

  const existing = await findWallet(userId, trimmed);
  if (existing) return existing;

  const wallet = await database.createDocument(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    ID.unique(),
    {
      userId,
      name: trimmed,
      name_lower: trimmed.toLowerCase(),
      amount: 0,
      totalIncome: 0,
      totalExpense: 0,
    },
  );

  console.log("💾 Wallet created:", wallet.name);
  return wallet;
}

async function deleteWallet(userId, name) {
  const wallet = await findWallet(userId, name);
  if (!wallet) return null;

  await database.deleteDocument(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    wallet.$id,
  );
  console.log("🗑️ Wallet deleted:", wallet.name);
  return wallet.$id;
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
    if (!userId)
      return sendToUser(ws, { type: "error", text: "Missing userId" });
    connectedUsers.set(ws, userId);

    // ---- Handle chat message ----
    if (data.type === "text") {
      const command = await parseCommandWithAI(data.text);
      if (!command || command.action === "unknown") {
        return sendToUser(ws, {
          type: "response",
          text: "❌ Could not understand command",
        });
      }

      try {
        if (command.action === "create_wallet") {
          const wallet = await createWallet(userId, command.name);
          sendToUser(ws, { type: "wallet_created", wallet });
        } else if (command.action === "delete_wallet") {
          const deletedId = await deleteWallet(userId, command.name);
          if (deletedId)
            sendToUser(ws, { type: "wallet_deleted", walletId: deletedId });
          else
            sendToUser(ws, { type: "response", text: "❌ Wallet not found" });
        } else {
          sendToUser(ws, { type: "response", text: "❌ Unknown action" });
        }
      } catch (err) {
        console.error("❌ CRUD Error:", err.message);
        sendToUser(ws, { type: "error", text: err.message });
      }
    }

    // ---- Handle audio chunks ----
    if (data.type === "audio") {
      if (!pendingAudio.has(ws))
        pendingAudio.set(ws, { chunks: [], format: data.format || "m4a" });
      pendingAudio.get(ws).chunks.push(Buffer.from(data.chunk, "base64"));
    }

    // ---- Handle done (finish recording) ----
    if (data.type === "done") {
      const pending = pendingAudio.get(ws);
      if (!pending)
        return sendToUser(ws, { type: "response", text: "No audio received" });

      pendingAudio.delete(ws);
      const text = await transcribeAudio(pending.chunks, pending.format);
      console.log("🎤 Transcribed:", text);

      sendToUser(ws, { type: "response", text: `🎤 You said: ${text}` });

      // Treat as text command
      ws.emit("message", JSON.stringify({ type: "text", userId, text }));
    }
  });

  ws.on("close", () => {
    connectedUsers.delete(ws);
    console.log("❌ Client disconnected");
  });
});
