import WebSocket, { WebSocketServer } from "ws";
import { Client, Databases, Query, ID, Permission, Role } from "node-appwrite";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import { RateLimiter } from "./rateLimiter.js";

dotenv.config();

// --- Config ---
const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  OPENAI_API_KEY
} = process.env;

const CONFIG = {
  rateLimitCollectionId: "ratelimits",
  dbId: "67ec72cd002e8ca58ead",
  walletCollectionId: "6820053a001909436a14",
  transactionCollectionId: "683e28b6002b61669545"
};

// --- Appwrite Client ---
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

const database = new Databases(client);
const rateLimiter = new RateLimiter(
  database,
  CONFIG.dbId,
  CONFIG.rateLimitCollectionId
);

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

function sendProgressUpdate(ws, message) {
  sendToUser(ws, { type: "progress", text: message });
}

const createUserPermissions = (userId) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId))
];

const verifyOwnership = (document, userId, userIdField = "userId") => {
  if (document[userIdField] !== userId) {
    throw new Error("Unauthorized: Document does not belong to this user");
  }
  return document;
};

async function transcribeAudio(chunks, format = "m4a") {
  const filePath = `/tmp/audio_${Date.now()}.${format}`;
  fs.writeFileSync(filePath, Buffer.concat(chunks));

  const result = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1"
  });

  fs.unlinkSync(filePath);
  return result.text;
}

// --- Get user financial summary for context ---
async function getUserFinancialSummary(userId) {
  try {
    const wallets = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.walletCollectionId,
      [Query.equal("userId", userId)]
    );

    const transactions = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      [Query.equal("uid", userId)]
    );

    const summary = {
      totalBalance: 0,
      totalIncome: 0,
      totalExpense: 0,
      walletCount: wallets.documents.length,
      transactionCount: transactions.documents.length,
      wallets: wallets.documents.map(w => ({
        name: w.name,
        amount: w.amount,
        totalIncome: w.totalIncome,
        totalExpense: w.totalExpense
      }))
    };

    wallets.documents.forEach(w => {
      summary.totalBalance += w.amount;
      summary.totalIncome += w.totalIncome;
      summary.totalExpense += w.totalExpense;
    });

    return summary;
  } catch (err) {
    console.error("Error getting financial summary:", err);
    return null;
  }
}

// --- Enhanced command parsing with financial context ---
async function parseCommandWithAI(text, userId = null, financialSummary = null) {
  console.log("🧠 Parsing:", text);

  let contextInfo = "";
  if (financialSummary) {
    contextInfo = `
User's Current Financial Status:
- Total Balance: $${financialSummary.totalBalance.toFixed(2)}
- Total Income: $${financialSummary.totalIncome.toFixed(2)}
- Total Expenses: $${financialSummary.totalExpense.toFixed(2)}
- Active Wallets: ${financialSummary.wallets.map(w => w.name).join(", ") || "None"}
`;
  }

  const systemPrompt = `
You are an intelligent financial advisor AI. You understand natural language and can parse financial commands with high accuracy.

${contextInfo}

Parse the user's message into a JSON command for wallet management.

Critical Rules:
1. Output ONLY valid JSON. No markdown, no text before or after.
2. Be extremely tolerant of casual speech and typos
3. Infer intent from context
4. Always try to find the right wallet (default to "main")
5. Capitalize amounts as numbers

Supported Commands:

CREATE_WALLET:
  Trigger words: add, create, make, open, new, setup, initialize
  Examples: "create btc wallet", "add a crypto wallet", "make checking account"
  Output: {"action":"create_wallet","name":"<wallet_name>"}

CREATE_TRANSACTION:
  Detect: type (income/expense), amount, category, wallet (optional), description
  Type keywords:
    - Income: earn, earned, got, deposit, received, make, incoming, added, received, plus
    - Expense: spent, pay, paid, cost, charge, spent on, minus, deducted
  Output: {
    "action":"create_transaction",
    "transaction":{
      "walletId":"<wallet_name_or_main>",
      "type":"income|expense",
      "amount":<number>,
      "category":"<inferred_category>",
      "description":"<optional>"
    }
  }

DELETE_WALLET:
  Trigger: delete, remove, close, erase, drop
  Examples: "delete btc wallet", "remove checking account"
  Output: {"action":"delete_wallet","name":"<wallet_name>"}

DELETE_TRANSACTION:
  Trigger: delete, remove, undo, revert, cancel (with transaction/expense/income)
  Extract: amount (required), type (optional), category (optional)
  Examples: "delete 50 expense", "remove that 200 income", "undo 15 coffee"
  Output: {"action":"delete_transaction","amount":<number>,"type":"income|expense|null","category":"<category|null>"}

SUMMARY:
  Trigger: summary, overview, total, how much, balance, spent, earned, status
  Examples: "show me a summary", "what's my total balance?", "how much did I spend?"
  Output: {"action":"summary"}

RECENT:
  Trigger: recent, last, latest, history
  Examples: "show recent transactions", "what did I spend recently?"
  Output: {"action":"recent","limit":5}

ANALYTICS:
  Trigger: analytics, analysis, breakdown, where, trending, most
  Examples: "where am I spending the most?", "show me spending breakdown"
  Output: {"action":"analytics"}

UNKNOWN:
  If truly unclear: {"action":"unknown"}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0
    });

    const aiText = response.choices[0]?.message?.content?.trim();
    const parsed = JSON.parse(aiText);
    console.log("✅ Parsed Command:", parsed);
    return parsed;
  } catch (err) {
    console.warn("❌ Invalid AI JSON:", err.message);
    return { action: "unknown" };
  }
}

// --- Enhanced AI response with financial insights ---
async function getAIAdvisoryResponse(text, financialSummary = null) {
  console.log("🧠 Generating advisory response for:", text);

  let contextInfo = "";
  if (financialSummary) {
    contextInfo = `
User Financial Context:
- Total Balance: $${financialSummary.totalBalance.toFixed(2)}
- Monthly Income: $${financialSummary.totalIncome.toFixed(2)}
- Monthly Expenses: $${financialSummary.totalExpense.toFixed(2)}
- Active Wallets: ${financialSummary.wallets.length}
${financialSummary.totalIncome > 0 ? `- Savings Rate: ${((1 - financialSummary.totalExpense / financialSummary.totalIncome) * 100).toFixed(1)}%` : ""}
`;
  }

  const systemPrompt = `
You are a knowledgeable and friendly financial advisor. The user asked something outside your core capabilities.
Respond warmly and naturally. If relevant, provide brief financial insights or suggestions.
Keep responses to 2-3 sentences maximum. Be conversational, not robotic.

${contextInfo}

Your capabilities are:
- Creating and managing wallets
- Recording income and expense transactions
- Deleting transactions
- Viewing financial summaries and analytics
- Tracking spending by category

When user asks about balance/summary, guide them to ask for a summary.
When user asks about recommendations, provide friendly advice based on their financial data if available.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.8
    });

    const aiText = response.choices[0]?.message?.content?.trim();
    return (
      aiText ||
      "I'm here to help with your finances! Ask me to create a wallet, record transactions, or show you a summary."
    );
  } catch (err) {
    console.error("Error generating response:", err);
    return "I'm here to help manage your finances! What would you like to do?";
  }
}

// --- Transaction finding with smart matching ---
async function findTransactionToDelete(userId, amount, type, category) {
  const transactions = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.transactionCollectionId,
    [Query.equal("uid", userId)]
  );

  const candidates = [];

  for (const txn of transactions.documents) {
    let score = 0;

    if (txn.amount !== amount) continue;
    score += 100;

    if (type && txn.type === type) {
      score += 50;
    } else if (type && txn.type !== type) {
      score -= 30;
    }

    if (category) {
      const txnCategory = txn.category?.toLowerCase() || "";
      const inputCategory = category.toLowerCase();

      if (txnCategory === inputCategory) {
        score += 50;
      } else if (
        txnCategory.includes(inputCategory) ||
        inputCategory.includes(txnCategory)
      ) {
        score += 25;
      } else {
        score -= 20;
      }
    }

    candidates.push({ txn, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;
  const bestMatch = candidates[0];

  if (bestMatch.score > 0) {
    console.log(
      `✅ Found transaction match (score: ${bestMatch.score}):`,
      bestMatch.txn
    );
    return bestMatch.txn;
  }

  return null;
}

// --- CRUD Helpers ---
async function findWallet(userId, name) {
  const normalized = name.trim().toLowerCase();
  const res = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    [Query.equal("userId", userId), Query.equal("name_lower", normalized)]
  );
  return res.documents[0] || null;
}

async function getWalletId(userId, walletName) {
  if (!walletName) walletName = "main";

  let wallet = await findWallet(userId, walletName);

  if (!wallet) {
    console.warn(`⚠️ Wallet "${walletName}" not found for userId ${userId}`);

    if (walletName.toLowerCase() === "main") {
      console.log(`💡 Creating default "main" wallet for userId ${userId}`);
      wallet = await createWallet(userId, "main");
    } else {
      throw new Error(`Wallet "${walletName}" not found for userId ${userId}`);
    }
  }

  verifyOwnership(wallet, userId, "userId");
  return wallet.$id;
}

async function createWallet(userId, name) {
  const trimmed = name.trim();
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
      totalExpense: 0
    },
    createUserPermissions(userId)
  );

  console.log("💾 Wallet created:", wallet.name);
  return wallet;
}

async function deleteTransaction(userId, transactionId) {
  try {
    const transaction = await database.getDocument(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      transactionId
    );

    if (!transaction) return false;
    verifyOwnership(transaction, userId, "uid");

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
}

async function deleteWallet(userId, name) {
  const wallet = await findWallet(userId, name);
  if (!wallet) return null;

  verifyOwnership(wallet, userId, "userId");

  const transactions = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.transactionCollectionId,
    [Query.equal("walletId", wallet.$id)]
  );

  for (const transaction of transactions.documents) {
    verifyOwnership(transaction, userId, "uid");
    await deleteTransaction(userId, transaction.$id);
  }

  await database.deleteDocument(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    wallet.$id
  );
  console.log("🗑️ Wallet deleted:", wallet.name);
  return wallet.$id;
}

async function createTransaction(userId, data) {
  console.log("💡 Creating transaction:", data);

  const transaction = await database.createDocument(
    CONFIG.dbId,
    CONFIG.transactionCollectionId,
    ID.unique(),
    {
      uid: userId,
      walletId: data.walletId,
      type: data.type,
      amount: data.amount,
      date: data.date || new Date().toISOString(),
      category: data.category || null,
      description: data.description || null
    },
    createUserPermissions(userId)
  );

  return transaction;
}

async function updateWalletTotals(
  userId,
  walletId,
  transaction,
  isDelete = false
) {
  const walletDoc = await database.getDocument(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    walletId
  );
  if (!walletDoc) throw new Error("Wallet not found");

  verifyOwnership(walletDoc, userId, "userId");

  let { amount = 0, totalIncome = 0, totalExpense = 0 } = walletDoc;

  if (isDelete) {
    if (transaction.type === "income") {
      totalIncome -= transaction.amount;
      amount -= transaction.amount;
    } else if (transaction.type === "expense") {
      totalExpense -= transaction.amount;
      amount += transaction.amount;
    }
  } else {
    if (transaction.type === "income") {
      totalIncome += transaction.amount;
      amount += transaction.amount;
    } else if (transaction.type === "expense") {
      totalExpense += transaction.amount;
      amount -= transaction.amount;
    }
  }

  const updatedWallet = await database.updateDocument(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    walletId,
    {
      amount,
      totalIncome,
      totalExpense
    }
  );

  console.log(`💰 Wallet updated: ${updatedWallet.name}`, updatedWallet);
  return updatedWallet;
}

// --- Get recent transactions ---
async function getRecentTransactions(userId, limit = 5) {
  try {
    const transactions = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      [
        Query.equal("uid", userId),
        Query.orderDesc("date"),
        Query.limit(limit)
      ]
    );

    return transactions.documents.map(t => ({
      ...t,
      date: new Date(t.date).toLocaleDateString()
    }));
  } catch (err) {
    console.error("Error fetching recent transactions:", err);
    return [];
  }
}

// --- Get spending analytics ---
async function getSpendingAnalytics(userId) {
  try {
    const transactions = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      [Query.equal("uid", userId), Query.equal("type", "expense")]
    );

    const byCategory = {};
    transactions.documents.forEach(t => {
      const cat = t.category || "Uncategorized";
      byCategory[cat] = (byCategory[cat] || 0) + t.amount;
    });

    return Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, amount]) => ({ category: cat, amount, percentage: 0 }));
  } catch (err) {
    console.error("Error getting analytics:", err);
    return [];
  }
}

// --- Main command processor ---
async function processCommand(ws, userId, command, userText = null) {
  try {
    // Get financial summary for context
    const summary = await getUserFinancialSummary(userId);

    if (command.action === "unknown") {
      const response = await getAIAdvisoryResponse(userText || "help", summary);
      await rateLimiter.incrementAIUsage(userId);
      return sendToUser(ws, { type: "response", text: response });
    }

    if (command.action === "create_wallet") {
      const wallet = await createWallet(userId, command.name);
      await rateLimiter.incrementAIUsage(userId);
      sendToUser(ws, { type: "wallet_created", wallet });
      return sendToUser(ws, {
        type: "response",
        text: `Perfect! I've created your "${wallet.name}" wallet. You're all set to start tracking transactions there.`
      });
    }

    if (command.action === "delete_wallet") {
      const deletedId = await deleteWallet(userId, command.name);
      if (deletedId) {
        await rateLimiter.incrementAIUsage(userId);
        sendToUser(ws, { type: "wallet_deleted", walletId: deletedId });
        return sendToUser(ws, {
          type: "response",
          text: `Done! I've deleted that wallet and all its transactions.`
        });
      }
      return sendToUser(ws, {
        type: "response",
        text: "I couldn't find that wallet. Did you mean a different one?"
      });
    }

    if (command.action === "create_transaction") {
      const transactionInfo = command.transaction;
      const walletName = transactionInfo.walletId;
      const walletId = await getWalletId(userId, walletName || "main");

      transactionInfo.walletId = walletId;

      const transaction = await createTransaction(userId, transactionInfo);
      const updatedWallet = await updateWalletTotals(
        userId,
        walletId,
        transactionInfo
      );

      await rateLimiter.incrementAIUsage(userId);
      sendToUser(ws, { type: "transaction_created", transaction });
      sendToUser(ws, { type: "wallet_updated", wallet: updatedWallet });

      const summaryText =
        transactionInfo.type === "expense"
          ? `Recorded a ${transactionInfo.category} expense of $${transactionInfo.amount.toFixed(2)}. Your ${updatedWallet.name} wallet balance is now $${updatedWallet.amount.toFixed(2)}.`
          : `Great! Logged $${transactionInfo.amount.toFixed(2)} income from ${transactionInfo.category}. Your ${updatedWallet.name} wallet is now at $${updatedWallet.amount.toFixed(2)}.`;

      return sendToUser(ws, { type: "response", text: summaryText });
    }

    if (command.action === "delete_transaction") {
      const txnToDelete = await findTransactionToDelete(
        userId,
        command.amount,
        command.type || null,
        command.category || null
      );

      if (!txnToDelete) {
        return sendToUser(ws, {
          type: "response",
          text: "I couldn't find that transaction. Can you be more specific? (e.g., the amount, category, or type)"
        });
      }

      const deleted = await deleteTransaction(userId, txnToDelete.$id);
      if (deleted) {
        const updatedWallet = await updateWalletTotals(
          userId,
          txnToDelete.walletId,
          txnToDelete,
          true
        );
        await rateLimiter.incrementAIUsage(userId);
        sendToUser(ws, {
          type: "transaction_deleted",
          transactionId: txnToDelete.$id
        });
        sendToUser(ws, { type: "wallet_updated", wallet: updatedWallet });
        return sendToUser(ws, {
          type: "response",
          text: `Deleted! Your ${updatedWallet.name} balance is now $${updatedWallet.amount.toFixed(2)}.`
        });
      }
      return sendToUser(ws, {
        type: "response",
        text: "Something went wrong. Please try again."
      });
    }

    if (command.action === "summary") {
      await rateLimiter.incrementAIUsage(userId);
      const summaryText = `📊 Financial Summary:\n\nTotal Balance: $${summary.totalBalance.toFixed(2)}\nTotal Income: $${summary.totalIncome.toFixed(2)}\nTotal Expenses: $${summary.totalExpense.toFixed(2)}\nActive Wallets: ${summary.wallets.length}\n\n${summary.wallets.map(w => `${w.name}: $${w.amount.toFixed(2)}`).join("\n")}`;
      return sendToUser(ws, { type: "response", text: summaryText });
    }

    if (command.action === "recent") {
      const recent = await getRecentTransactions(userId, command.limit || 5);
      await rateLimiter.incrementAIUsage(userId);

      if (recent.length === 0) {
        return sendToUser(ws, {
          type: "response",
          text: "No transactions recorded yet. Start by adding one!"
        });
      }

      const recentText = `📋 Recent Transactions:\n\n${recent
        .map(
          t =>
            `${t.date} - ${t.type === "income" ? "+" : "-"}$${t.amount.toFixed(2)} (${t.category})`
        )
        .join("\n")}`;

      return sendToUser(ws, { type: "response", text: recentText });
    }

    if (command.action === "analytics") {
      const analytics = await getSpendingAnalytics(userId);
      await rateLimiter.incrementAIUsage(userId);

      if (analytics.length === 0) {
        return sendToUser(ws, {
          type: "response",
          text: "No expense data yet to analyze. Record some expenses first!"
        });
      }

      const analyticsText = `📈 Top Spending Categories:\n\n${analytics
        .map(
          (a, i) =>
            `${i + 1}. ${a.category}: $${a.amount.toFixed(2)}`
        )
        .join("\n")}`;

      return sendToUser(ws, { type: "response", text: analyticsText });
    }
  } catch (err) {
    console.error("Error processing command:", err);
    throw err;
  }
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

    try {
      if (data.type === "check_allowance") {
        console.log("📊 Checking allowance for:", userId);
        const allowance = await rateLimiter.getRemainingAllowance(userId);
        return sendToUser(ws, {
          type: "allowance_info",
          allowance: {
            remaining: allowance.remaining,
            limit: allowance.limit,
            resetTime: allowance.resetTime
          }
        });
      }

      if (data.type === "text") {
        const rateLimitCheck = await rateLimiter.canMakeAIRequest(userId);

        if (!rateLimitCheck.allowed) {
          return sendToUser(ws, {
            type: "rate_limit_exceeded",
            remaining: rateLimitCheck.remaining,
            limit: rateLimitCheck.limit,
            text: `You've used your daily AI requests. You have ${rateLimitCheck.remaining} remaining. Upgrade your plan for unlimited access!`
          });
        }

        sendProgressUpdate(ws, "Analyzing your request...");
        const summary = await getUserFinancialSummary(userId);
        const command = await parseCommandWithAI(data.text, userId, summary);
        await processCommand(ws, userId, command, data.text);
      } else if (data.type === "audio") {
        const rateLimitCheck = await rateLimiter.canMakeAIRequest(userId);

        if (!rateLimitCheck.allowed) {
          return sendToUser(ws, {
            type: "rate_limit_exceeded",
            remaining: rateLimitCheck.remaining,
            limit: rateLimitCheck.limit,
            text: `You've used your daily AI requests. Upgrade your plan for unlimited access!`
          });
        }

        if (!pendingAudio.has(ws)) {
          pendingAudio.set(ws, { chunks: [], format: data.format || "m4a" });
        }
        pendingAudio.get(ws).chunks.push(Buffer.from(data.chunk, "base64"));
      } else if (data.type === "done") {
        const pending = pendingAudio.get(ws);
        if (!pending || pending.chunks.length === 0) {
          return sendToUser(ws, {
            type: "response",
            text: "No audio received"
          });
        }

        pendingAudio.delete(ws);
        sendProgressUpdate(ws, "Transcribing audio...");
        const text = await transcribeAudio(pending.chunks, pending.format);
        console.log("🎤 Transcribed:", text);

        sendToUser(ws, { type: "response", text: `🎤 You said: "${text}"` });

        sendProgressUpdate(ws, "Processing your request...");
        const summary = await getUserFinancialSummary(userId);
        const command = await parseCommandWithAI(text, userId, summary);
        await processCommand(ws, userId, command, text);
      }
    } catch (err) {
      console.error("Error processing message:", err);
      sendToUser(ws, {
        type: "error",
        text: err instanceof Error ? err.message : "An error occurred"
      });
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
