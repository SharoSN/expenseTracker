import WebSocket, { WebSocketServer } from "ws";
import { Client, Databases, Query, ID, Permission, Role } from "node-appwrite";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";
import { RateLimiter } from "./rateLimiter.js";

dotenv.config();

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
  transactionCollectionId: "683e28b6002b61669545",
  budgetCollectionId: "budgets",
  usersCollectionId: "67ec73c70004d6f7637c",
  currency: "€",
  currencyCode: "EUR"
};

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
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const wss = new WebSocketServer({ host: "0.0.0.0", port: 3000 });
console.log("✅ WebSocket server running on ws://0.0.0.0:3000");

const pendingAudio = new Map();
const userSockets = new Map();

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
  if (document[userIdField] !== userId)
    throw new Error("Unauthorized: Document does not belong to this user");
  return document;
};

async function transcribeAudio(chunks, format = "m4a") {
  const filePath = `/tmp/audio_${Date.now()}.${format}`;
  fs.writeFileSync(filePath, Buffer.concat(chunks));
  try {
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1"
    });
    return result.text;
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("⚠️ Could not delete temp audio file:", e.message);
    }
  }
}

async function getAllUserTransactions(userId) {
  const allDocs = [];
  let offset = 0;
  const batchSize = 100;
  while (true) {
    const res = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      [Query.equal("uid", userId), Query.limit(batchSize), Query.offset(offset)]
    );
    allDocs.push(...res.documents);
    if (res.documents.length < batchSize) break;
    offset += batchSize;
  }
  return allDocs;
}

async function getMonthlySpending(userId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const allTransactions = await getAllUserTransactions(userId);
  const monthlyExpenses = allTransactions.filter(
    (tx) => tx.type === "expense" && new Date(tx.date) >= monthStart
  );
  const total = monthlyExpenses.reduce((s, tx) => s + tx.amount, 0);
  const byCategory = {};
  monthlyExpenses.forEach((tx) => {
    const cat = tx.category || "others";
    byCategory[cat] = (byCategory[cat] || 0) + tx.amount;
  });
  return { total, byCategory };
}

async function getUserFinancialSummary(userId) {
  try {
    const [walletsRes, monthlySpending] = await Promise.all([
      database.listDocuments(CONFIG.dbId, CONFIG.walletCollectionId, [
        Query.equal("userId", userId)
      ]),
      getMonthlySpending(userId)
    ]);
    const allTransactions = await getAllUserTransactions(userId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyIncome = allTransactions
      .filter((tx) => tx.type === "income" && new Date(tx.date) >= monthStart)
      .reduce((s, tx) => s + tx.amount, 0);
    const summary = {
      totalBalance: 0,
      totalIncome: monthlyIncome,
      totalExpense: monthlySpending.total,
      walletCount: walletsRes.documents.length,
      transactionCount: allTransactions.length,
      transactions: allTransactions,
      wallets: walletsRes.documents.map((w) => ({
        name: w.name,
        amount: w.amount,
        totalIncome: w.totalIncome,
        totalExpense: w.totalExpense
      }))
    };
    walletsRes.documents.forEach((w) => {
      summary.totalBalance += w.amount;
    });
    return summary;
  } catch (err) {
    console.error("Error getting financial summary:", err);
    return null;
  }
}

function formatEUR(amount) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(amount);
}

const CATEGORY_KEYWORDS = {
  groceries: [
    "groceries",
    "grocery",
    "food",
    "supermarket",
    "edeka",
    "rewe",
    "aldi",
    "lidl",
    "kaufland",
    "market",
    "shopping cart",
    "produce",
    "milk",
    "bread",
    "eggs"
  ],
  rent: [
    "rent",
    "rental",
    "landlord",
    "apartment",
    "lease",
    "housing payment",
    "monthly rent"
  ],
  utilities: [
    "utilities",
    "electricity",
    "water",
    "gas",
    "internet",
    "phone",
    "cable",
    "broadband",
    "power",
    "wifi",
    "bill"
  ],
  transportation: [
    "transportation",
    "transport",
    "gas",
    "petrol",
    "fuel",
    "taxi",
    "uber",
    "train",
    "bus",
    "metro",
    "ticket",
    "car",
    "parking",
    "bike",
    "motorcycle"
  ],
  entertainment: [
    "entertainment",
    "movie",
    "cinema",
    "game",
    "spotify",
    "netflix",
    "music",
    "concert",
    "show",
    "streaming",
    "movies",
    "games",
    "hobby"
  ],
  dining: [
    "dining",
    "restaurant",
    "cafe",
    "coffee",
    "pizza",
    "burger",
    "lunch",
    "dinner",
    "breakfast",
    "eating",
    "food delivery",
    "takeout",
    "delivery",
    "eat"
  ],
  health: [
    "health",
    "doctor",
    "medicine",
    "pharmacy",
    "gym",
    "fitness",
    "hospital",
    "dental",
    "medical",
    "health care",
    "therapy",
    "wellness",
    "exercise"
  ],
  insurance: [
    "insurance",
    "premium",
    "claim",
    "policy",
    "coverage",
    "health insurance",
    "car insurance",
    "home insurance"
  ],
  savings: [
    "savings",
    "save",
    "deposit",
    "transfer to savings",
    "emergency fund"
  ],
  clothing: [
    "clothing",
    "clothes",
    "fashion",
    "shirt",
    "pants",
    "shoes",
    "dress",
    "jacket",
    "apparel",
    "wear"
  ],
  personal: [
    "personal",
    "gift",
    "birthday",
    "vacation",
    "travel",
    "holiday",
    "haircut",
    "salon",
    "self-care"
  ],
  others: ["miscellaneous", "misc", "other", "other expenses"]
};

function detectCategory(text, type = "expense") {
  if (!text) return "others";
  const lowerText = text.toLowerCase().trim();
  const allKeywords = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS))
    for (const keyword of keywords) allKeywords.push({ category, keyword });
  allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);
  for (const { category, keyword } of allKeywords)
    if (lowerText.includes(keyword)) return category;
  return "others";
}

async function getUserWallets(userId) {
  const res = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    [Query.equal("userId", userId)]
  );
  return res.documents;
}

async function resolveWallet(userId, aiWalletName, userText, userWallets) {
  const normalizedName = (aiWalletName || "").toLowerCase().trim();
  const lowerUserText = (userText || "").toLowerCase();
  const mentionedInText = userWallets.find((w) =>
    lowerUserText.includes(w.name.toLowerCase().trim())
  );
  if (mentionedInText) return { walletId: mentionedInText.$id };
  const isAIDefault = normalizedName === "main" || normalizedName === "";
  if (!isAIDefault) {
    const exactMatch = userWallets.find(
      (w) => w.name.toLowerCase().trim() === normalizedName
    );
    if (exactMatch) return { walletId: exactMatch.$id };
  }
  if (userWallets.length === 0) {
    const wallet = await createWallet(userId, "main");
    return { walletId: wallet.$id };
  }
  if (userWallets.length === 1) return { walletId: userWallets[0].$id };
  return { needsSelection: true, wallets: userWallets };
}

// ── BUDGET FUNCTIONS ──────────────────────────────────────────────────────────

async function getUserBudgets(userId) {
  try {
    const res = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.budgetCollectionId,
      [Query.equal("userId", userId)]
    );
    return res.documents;
  } catch (err) {
    console.error("Error getting budgets:", err);
    return [];
  }
}

async function setBudget(userId, amount, category = null) {
  const existing = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.budgetCollectionId,
    [Query.equal("userId", userId), Query.equal("type", "monthly")]
  );
  const match = existing.documents.find((b) =>
    category ? b.category === category : b.category === null
  );
  if (match)
    return await database.updateDocument(
      CONFIG.dbId,
      CONFIG.budgetCollectionId,
      match.$id,
      { amount }
    );
  return await database.createDocument(
    CONFIG.dbId,
    CONFIG.budgetCollectionId,
    ID.unique(),
    { userId, type: "monthly", category: category || null, amount },
    createUserPermissions(userId)
  );
}

async function deleteBudget(userId, category = null) {
  const existing = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.budgetCollectionId,
    [Query.equal("userId", userId), Query.equal("type", "monthly")]
  );
  const match = existing.documents.find((b) =>
    category ? b.category === category : b.category === null
  );
  if (!match) return false;
  verifyOwnership(match, userId, "userId");
  await database.deleteDocument(
    CONFIG.dbId,
    CONFIG.budgetCollectionId,
    match.$id
  );
  return true;
}

async function checkBudgetAlerts(userId) {
  try {
    const [budgets, spending] = await Promise.all([
      getUserBudgets(userId),
      getMonthlySpending(userId)
    ]);
    console.log(
      "🧾 Budget check — budgets:",
      budgets.length,
      "spending total:",
      spending.total
    );
    if (budgets.length === 0) return [];
    const alerts = [];
    for (const budget of budgets) {
      const isOverall = budget.category === null;
      const spent = isOverall
        ? spending.total
        : spending.byCategory[budget.category] || 0;
      console.log(
        `📊 Budget "${budget.category ?? "overall"}": spent=${spent}, limit=${budget.amount}`
      );
      if (spent === 0) continue;
      const pct = (spent / budget.amount) * 100;
      const label = isOverall
        ? "overall monthly"
        : `${budget.category} monthly`;
      if (pct >= 100) {
        alerts.push({
          severity: "exceeded",
          label,
          category: budget.category,
          spent,
          limit: budget.amount,
          overBy: spent - budget.amount,
          pct: Math.round(pct)
        });
      } else if (pct >= 80) {
        alerts.push({
          severity: "warning",
          label,
          category: budget.category,
          spent,
          limit: budget.amount,
          remaining: budget.amount - spent,
          pct: Math.round(pct)
        });
      }
    }
    console.log("🚨 Alerts generated:", alerts.length);
    return alerts;
  } catch (err) {
    console.error("Error checking budget alerts:", err);
    return [];
  }
}

function formatBudgetAlertText(alerts) {
  if (alerts.length === 0) return null;
  return alerts
    .map((a) => {
      if (a.severity === "exceeded")
        return `🚨 You've exceeded your ${a.label} budget!\n   Spent: €${a.spent.toFixed(2)} / Limit: €${a.limit.toFixed(2)} (over by €${a.overBy.toFixed(2)})`;
      return `⚠️  You're at ${a.pct}% of your ${a.label} budget.\n   Spent: €${a.spent.toFixed(2)} / Limit: €${a.limit.toFixed(2)} (€${a.remaining.toFixed(2)} remaining)`;
    })
    .join("\n\n");
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────

async function savePushToken(userId, pushToken) {
  try {
    const res = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.usersCollectionId,
      [Query.equal("$id", userId)]
    );
    if (res.documents.length > 0) {
      await database.updateDocument(
        CONFIG.dbId,
        CONFIG.usersCollectionId,
        res.documents[0].$id,
        { pushToken }
      );
      console.log("📱 Push token saved for", userId);
    }
  } catch (err) {
    console.error("Error saving push token:", err);
  }
}

async function getPushToken(userId) {
  try {
    const res = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.usersCollectionId,
      [Query.equal("$id", userId)]
    );
    return res.documents[0]?.pushToken || null;
  } catch {
    return null;
  }
}

async function sendPushNotification(pushToken, title, body) {
  if (!pushToken) return;
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: pushToken,
        sound: "default",
        title,
        body,
        data: { type: "budget_alert" }
      })
    });
    const result = await response.json();
    console.log("📬 Push sent:", result?.data?.status || result);
  } catch (err) {
    console.error("Error sending push notification:", err);
  }
}

async function sendBudgetAlertPush(userId, alerts) {
  if (alerts.length === 0) return;
  const pushToken = await getPushToken(userId);
  if (!pushToken) return;
  const exceeded = alerts.filter((a) => a.severity === "exceeded");
  const warnings = alerts.filter((a) => a.severity === "warning");
  if (exceeded.length > 0) {
    const a = exceeded[0];
    await sendPushNotification(
      pushToken,
      "🚨 Budget Exceeded!",
      `Your ${a.label} budget is over by €${a.overBy.toFixed(2)} (spent €${a.spent.toFixed(2)} of €${a.limit.toFixed(2)})`
    );
  } else if (warnings.length > 0) {
    const a = warnings[0];
    await sendPushNotification(
      pushToken,
      "⚠️ Budget Warning",
      `You've used ${a.pct}% of your ${a.label} budget — €${a.remaining.toFixed(2)} remaining`
    );
  }
}

// ── SEND BUDGET ALERT HELPER ──────────────────────────────────────────────────
// Sends budget_alert BEFORE response so both travel on the same socket connection
async function sendBudgetAlertsIfNeeded(ws, userId) {
  const alerts = await checkBudgetAlerts(userId);
  console.log("📤 Sending budget alerts:", alerts.length);
  if (alerts.length > 0) {
    sendToUser(ws, {
      type: "budget_alert",
      alerts,
      text: formatBudgetAlertText(alerts)
    });
    await sendBudgetAlertPush(userId, alerts);
  }
  return alerts;
}

// ── MANUAL TRANSACTION BUDGET CHECK ──────────────────────────────────────────
async function handleManualTransactionBudgetCheck(ws, userId) {
  try {
    await sendBudgetAlertsIfNeeded(ws, userId);
  } catch (err) {
    console.error("Error in manual budget check:", err);
  }
}

// ── AI COMMAND PARSER ─────────────────────────────────────────────────────────

async function parseCommandWithAI(
  text,
  userId = null,
  financialSummary = null
) {
  let contextInfo = "";
  if (financialSummary) {
    contextInfo = `
User Financial Context:
- Total Balance: ${formatEUR(financialSummary.totalBalance)}
- Monthly Income: ${formatEUR(financialSummary.totalIncome)}
- Monthly Expenses: ${formatEUR(financialSummary.totalExpense)}
- Active Wallets: ${financialSummary.wallets.map((w) => w.name).join(", ") || "None"}
`;
  }
  const systemPrompt = `
You are an intelligent financial advisor AI for a German user. Always respond in English only. ALL amounts are EUR. Never convert.

${contextInfo}

Categories (use ONLY these): groceries, rent, utilities, transportation, entertainment, dining, health, insurance, savings, clothing, personal, others

Rules:
1. Output ONLY valid JSON. No markdown.
2. Tolerate casual speech/typos
3. Use wallet name exactly if mentioned, else "main"
4. Extract amounts exactly as stated
5. Multiple transactions → use transactions array
6. DELETE_WALLET with no name → set name to ""
7. SET_BUDGET: no category → null (overall). Category → use exact category.
8. DELETE_BUDGET: same as SET_BUDGET.

Commands:
CREATE_WALLET: {"action":"create_wallet","name":"<wallet_name>"}
CREATE_TRANSACTION: {"action":"create_transaction","transaction":{"walletId":"<wallet_name_or_main>","type":"income|expense","amount":<number>,"category":"<category>","description":"<optional>"}}
CREATE_TRANSACTIONS: {"action":"create_transactions","transactions":[{"walletId":"<wallet_name_or_main>","type":"income|expense","amount":<number>,"category":"<category>","description":"<optional>"}]}
DELETE_WALLET: {"action":"delete_wallet","name":"<wallet_name_or_empty_string>"}
DELETE_TRANSACTION: {"action":"delete_transaction","amount":<number>,"type":"income|expense|null","category":"<category|null>","walletId":"<wallet_name_or_null>"}
SET_BUDGET: {"action":"set_budget","amount":<number>,"category":"<category_or_null>"}
GET_BUDGETS: {"action":"get_budgets"}
DELETE_BUDGET: {"action":"delete_budget","category":"<category_or_null>"}
SUMMARY: {"action":"summary"}
RECENT: {"action":"recent","limit":5}
ANALYTICS: {"action":"analytics"}
UNKNOWN: {"action":"unknown"}
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
    let parsed = JSON.parse(response.choices[0]?.message?.content?.trim());
    const validCategories = Object.keys(CATEGORY_KEYWORDS);
    if (parsed.action === "create_transaction" && parsed.transaction) {
      if (
        !parsed.transaction.category ||
        !validCategories.includes(parsed.transaction.category)
      )
        parsed.transaction.category = detectCategory(
          parsed.transaction.description || text,
          parsed.transaction.type
        );
    }
    if (parsed.action === "create_transactions" && parsed.transactions) {
      parsed.transactions = parsed.transactions.map((txn) => {
        if (!txn.category || !validCategories.includes(txn.category))
          txn.category = detectCategory(txn.description || text, txn.type);
        return txn;
      });
    }
    console.log("✅ Parsed Command:", parsed);
    return parsed;
  } catch (err) {
    console.warn("❌ Invalid AI JSON:", err.message);
    return { action: "unknown" };
  }
}

async function getAIAdvisoryResponse(text, financialSummary = null) {
  let contextInfo = "";
  if (financialSummary) {
    contextInfo = `**USER FINANCIAL DATA:**\n- Total Balance: ${formatEUR(financialSummary.totalBalance)}\n- Monthly Income: ${formatEUR(financialSummary.totalIncome)}\n- Monthly Expenses: ${formatEUR(financialSummary.totalExpense)}\n**WALLETS:**\n${financialSummary.wallets.map((w) => `- ${w.name}: ${formatEUR(w.amount)}`).join("\n")}`;
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: `You are a friendly financial advisor. Always respond in English. Use EUR only.\n${contextInfo}\nRespond warmly in 2-3 sentences max.`
        },
        { role: "user", content: text }
      ],
      temperature: 0.2,
      max_tokens: 150
    });
    return (
      response.choices[0]?.message?.content?.trim() ||
      "I'm here to help with your finances!"
    );
  } catch (err) {
    return "I'm here to help manage your finances! What would you like to do?";
  }
}

async function findTransactionCandidates(
  userId,
  amount,
  type,
  category,
  walletId,
  userWallets
) {
  const allTransactions = await getAllUserTransactions(userId);
  const walletMap = Object.fromEntries(userWallets.map((w) => [w.$id, w.name]));
  let resolvedWalletId = null;
  if (walletId) {
    const matched = userWallets.find(
      (w) => w.name.toLowerCase().trim() === walletId.toLowerCase().trim()
    );
    if (matched) resolvedWalletId = matched.$id;
  }
  const candidates = [];
  for (const txn of allTransactions) {
    let score = 0;
    if (txn.amount !== amount) continue;
    score += 100;
    if (resolvedWalletId) {
      if (txn.walletId === resolvedWalletId) score += 200;
      else score -= 150;
    }
    if (type && txn.type === type) score += 50;
    else if (type && txn.type !== type) score -= 80;
    if (category) {
      const txnCat = txn.category?.toLowerCase() || "";
      const inCat = category.toLowerCase();
      if (txnCat === inCat) score += 50;
      else if (txnCat.includes(inCat) || inCat.includes(txnCat)) score += 25;
      else score -= 20;
    }
    const daysAgo = (new Date() - new Date(txn.date)) / (1000 * 60 * 60 * 24);
    if (daysAgo < 1) score += 30;
    else if (daysAgo < 2) score += 20;
    else if (daysAgo < 7) score += 10;
    if (score > 0)
      candidates.push({
        txn: { ...txn, walletName: walletMap[txn.walletId] || "Unknown" },
        score
      });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function resolveTransactionFromInput(input, pendingTxns) {
  const userInput = input.toLowerCase().trim();
  const indexMap = {
    first: 0,
    1: 0,
    second: 1,
    2: 1,
    third: 2,
    3: 2,
    fourth: 3,
    4: 3
  };
  for (const [word, idx] of Object.entries(indexMap))
    if (userInput.includes(word) && pendingTxns[idx]) return pendingTxns[idx];
  return (
    pendingTxns.find(
      (t) =>
        userInput.includes(t.walletName?.toLowerCase()) ||
        userInput.includes(t.category?.toLowerCase())
    ) || null
  );
}

function isCancelIntent(input) {
  const lower = input.toLowerCase().trim();
  return (
    lower.includes("cancel") ||
    lower.includes("never mind") ||
    lower.includes("nevermind") ||
    lower.includes("stop")
  );
}

function formatTransactionSelectionList(pendingTxns) {
  return pendingTxns.map((t) => ({
    id: t.$id,
    amount: t.amount,
    type: t.type,
    category: t.category,
    date: new Date(t.date).toLocaleDateString("de-DE"),
    walletName: t.walletName,
    formattedAmount: `${t.type === "income" ? "+" : "-"}€${t.amount.toFixed(2)}`
  }));
}

async function findWallet(userId, name) {
  const res = await database.listDocuments(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    [
      Query.equal("userId", userId),
      Query.equal("name_lower", name.trim().toLowerCase())
    ]
  );
  return res.documents[0] || null;
}

async function createWallet(userId, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Wallet name cannot be empty.");
  const duplicate = await findWallet(userId, trimmed);
  if (duplicate)
    throw new Error(
      `You already have a wallet named "${trimmed}". Please choose a different name.`
    );
  const allWallets = await getUserWallets(userId);
  if (allWallets.length >= 10)
    throw new Error(
      "Wallet limit reached. You can have a maximum of 10 wallets."
    );
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
  for (const t of transactions.documents) {
    verifyOwnership(t, userId, "uid");
    await deleteTransaction(userId, t.$id);
  }
  await database.deleteDocument(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    wallet.$id
  );
  return wallet.$id;
}

async function createTransaction(userId, data) {
  return await database.createDocument(
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
    } else {
      totalExpense -= transaction.amount;
      amount += transaction.amount;
    }
  } else {
    if (transaction.type === "income") {
      totalIncome += transaction.amount;
      amount += transaction.amount;
    } else {
      totalExpense += transaction.amount;
      amount -= transaction.amount;
    }
  }
  return await database.updateDocument(
    CONFIG.dbId,
    CONFIG.walletCollectionId,
    walletId,
    { amount, totalIncome, totalExpense }
  );
}

async function getRecentTransactions(userId, limit = 5) {
  try {
    const t = await database.listDocuments(
      CONFIG.dbId,
      CONFIG.transactionCollectionId,
      [Query.equal("uid", userId), Query.orderDesc("date"), Query.limit(limit)]
    );
    return t.documents.map((t) => ({
      ...t,
      date: new Date(t.date).toLocaleDateString("de-DE")
    }));
  } catch (err) {
    return [];
  }
}

async function getSimpleAnalytics(userId) {
  try {
    const allTransactions = await getAllUserTransactions(userId);
    const expenses = allTransactions.filter((tx) => tx.type === "expense");
    if (expenses.length === 0) return null;
    const byCategory = {};
    let total = 0;
    expenses.forEach((tx) => {
      const cat = tx.category || "others";
      byCategory[cat] = (byCategory[cat] || 0) + tx.amount;
      total += tx.amount;
    });
    return Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        percentage:
          total > 0 ? parseFloat(((amount / total) * 100).toFixed(1)) : 0
      }));
  } catch (err) {
    return null;
  }
}

async function getSpendingAnalytics(userId) {
  try {
    const allTx = await getAllUserTransactions(userId);
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59
    );
    const thisMonthTx = allTx.filter(
      (tx) => new Date(tx.date) >= thisMonthStart
    );
    const lastMonthTx = allTx.filter((tx) => {
      const d = new Date(tx.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });
    const sumByCategory = (txList, type = "expense") => {
      const map = {};
      txList
        .filter((tx) => tx.type === type)
        .forEach((tx) => {
          const cat = tx.category || "others";
          map[cat] = (map[cat] || 0) + tx.amount;
        });
      return map;
    };
    const thisMonthExpenses = sumByCategory(thisMonthTx, "expense");
    const lastMonthExpenses = sumByCategory(lastMonthTx, "expense");
    const thisMonthIncome = thisMonthTx
      .filter((tx) => tx.type === "income")
      .reduce((s, tx) => s + tx.amount, 0);
    const thisMonthTotal = Object.values(thisMonthExpenses).reduce(
      (s, v) => s + v,
      0
    );
    const allCategories = new Set([
      ...Object.keys(thisMonthExpenses),
      ...Object.keys(lastMonthExpenses)
    ]);
    const categoryBreakdown = Array.from(allCategories)
      .map((cat) => {
        const current = thisMonthExpenses[cat] || 0;
        const previous = lastMonthExpenses[cat] || 0;
        const change =
          previous > 0
            ? ((current - previous) / previous) * 100
            : current > 0
              ? 100
              : 0;
        return {
          category: cat,
          amount: current,
          previousAmount: previous,
          percentage: thisMonthTotal > 0 ? (current / thisMonthTotal) * 100 : 0,
          change: parseFloat(change.toFixed(1)),
          trend: change > 15 ? "up" : change < -15 ? "down" : "stable"
        };
      })
      .filter((c) => c.amount > 0 || c.previousAmount > 0)
      .sort((a, b) => b.amount - a.amount);
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    const weeklyMap = {};
    allTx
      .filter(
        (tx) => tx.type === "expense" && new Date(tx.date) >= eightWeeksAgo
      )
      .forEach((tx) => {
        const d = new Date(tx.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        });
        weeklyMap[key] = (weeklyMap[key] || 0) + tx.amount;
      });
    const weeklyTrend = Object.entries(weeklyMap)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .slice(-8)
      .map(([week, amount]) => ({ week, amount }));
    return {
      categoryBreakdown,
      thisMonthTotal,
      lastMonthTotal: Object.values(lastMonthExpenses).reduce(
        (s, v) => s + v,
        0
      ),
      thisMonthIncome,
      weeklyTrend,
      hasData: allTx.length > 0
    };
  } catch (err) {
    return null;
  }
}

async function detectSpendingAnomalies(userId) {
  try {
    const allTransactions = await getAllUserTransactions(userId);
    const expenses = allTransactions.filter((tx) => tx.type === "expense");
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const monthlyByCategory = {};
    expenses.forEach((tx) => {
      const d = new Date(tx.date);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const cat = tx.category || "others";
      if (!monthlyByCategory[cat]) monthlyByCategory[cat] = {};
      if (!monthlyByCategory[cat][monthKey])
        monthlyByCategory[cat][monthKey] = 0;
      monthlyByCategory[cat][monthKey] += tx.amount;
    });
    const anomalies = [];
    for (const [category, monthData] of Object.entries(monthlyByCategory)) {
      const currentAmount = monthData[thisMonthKey] || 0;
      if (currentAmount === 0) continue;
      const historicalAmounts = Object.entries(monthData)
        .filter(([key]) => key !== thisMonthKey)
        .map(([, amount]) => amount);
      if (historicalAmounts.length < 2) continue;
      const avg =
        historicalAmounts.reduce((s, v) => s + v, 0) / historicalAmounts.length;
      const stdDev = Math.sqrt(
        historicalAmounts.reduce((s, v) => s + Math.pow(v - avg, 2), 0) /
          historicalAmounts.length
      );
      const zScore = stdDev > 0 ? (currentAmount - avg) / stdDev : 0;
      const percentAbove = avg > 0 ? ((currentAmount - avg) / avg) * 100 : 0;
      if (zScore > 1.5 && percentAbove > 40)
        anomalies.push({
          category,
          currentAmount,
          historicalAvg: avg,
          percentAbove: parseFloat(percentAbove.toFixed(1)),
          severity: zScore > 2.5 ? "high" : "medium"
        });
    }
    return anomalies.sort((a, b) => b.percentAbove - a.percentAbove);
  } catch (err) {
    return [];
  }
}

async function getSmartInsights(userId, analyticsData, anomalies) {
  try {
    const allTransactions = await getAllUserTransactions(userId);
    const weekdayExpense = { weekday: 0, weekend: 0 };
    const categoryByDayType = {};
    allTransactions
      .filter((tx) => tx.type === "expense")
      .forEach((tx) => {
        const day = new Date(tx.date).getDay();
        const isWeekend = day === 0 || day === 6;
        const key = isWeekend ? "weekend" : "weekday";
        weekdayExpense[key] += tx.amount;
        const cat = tx.category || "others";
        if (!categoryByDayType[cat])
          categoryByDayType[cat] = { weekday: 0, weekend: 0 };
        categoryByDayType[cat][key] += tx.amount;
      });
    const weekendHeavyCategory = Object.entries(categoryByDayType)
      .filter(([, v]) => v.weekend > 0 && v.weekday > 0)
      .map(([cat, v]) => ({ cat, ratio: v.weekend / (v.weekday + v.weekend) }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    const biggestIncrease = analyticsData.categoryBreakdown
      .filter((c) => c.change > 0 && c.previousAmount > 0)
      .sort((a, b) => b.change - a.change)[0];
    const biggestDecrease = analyticsData.categoryBreakdown
      .filter((c) => c.change < 0 && c.previousAmount > 0)
      .sort((a, b) => a.change - b.change)[0];
    const insightContext = `This month: ${formatEUR(analyticsData.thisMonthTotal)}, Last: ${formatEUR(analyticsData.lastMonthTotal)}, Income: ${formatEUR(analyticsData.thisMonthIncome)}\nTop: ${analyticsData.categoryBreakdown
      .slice(0, 5)
      .map(
        (c) =>
          `${c.category} ${formatEUR(c.amount)} (${c.change > 0 ? "+" : ""}${c.change}%)`
      )
      .join(
        ", "
      )}\nWeekdays: ${formatEUR(weekdayExpense.weekday)}, Weekends: ${formatEUR(weekdayExpense.weekend)}\n${weekendHeavyCategory ? `${weekendHeavyCategory.cat} is ${(weekendHeavyCategory.ratio * 100).toFixed(0)}% weekend` : ""}\n${biggestIncrease ? `Biggest increase: ${biggestIncrease.category} +${biggestIncrease.change}%` : ""}\n${biggestDecrease ? `Biggest decrease: ${biggestDecrease.category} ${biggestDecrease.change}%` : ""}\nAnomalies: ${anomalies.length > 0 ? anomalies.map((a) => `${a.category} ${a.percentAbove}% above usual`).join(", ") : "none"}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: `You are a sharp financial analyst. Generate EXACTLY 3 concise insights. 1 sentence each, max 20 words, specific numbers, direct tone, English only, EUR amounts. Format: [{"type":"trend|insight|anomaly","emoji":"<emoji>","text":"<insight>"}] Output ONLY valid JSON.`
        },
        { role: "user", content: insightContext }
      ],
      temperature: 0.3,
      max_tokens: 200
    });
    const raw = response.choices[0]?.message?.content?.trim();
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (err) {
    return [];
  }
}

// ── PROCESS COMMAND ───────────────────────────────────────────────────────────
async function processCommand(
  ws,
  userId,
  command,
  userText = null,
  summary = null
) {
  try {
    if (!summary) summary = await getUserFinancialSummary(userId);

    if (command.action === "unknown") {
      const response = await getAIAdvisoryResponse(userText || "help", summary);
      await rateLimiter.incrementAIUsage(userId);
      return sendToUser(ws, { type: "response", text: response });
    }

    if (command.action === "create_wallet") {
      try {
        const wallet = await createWallet(userId, command.name);
        await rateLimiter.incrementAIUsage(userId);
        sendToUser(ws, { type: "wallet_created", wallet });
        return sendToUser(ws, {
          type: "response",
          text: `Perfect! I've created your "${wallet.name}" wallet.`
        });
      } catch (err) {
        return sendToUser(ws, { type: "response", text: err.message });
      }
    }

    if (command.action === "delete_wallet") {
      const userWallets = await getUserWallets(userId);
      if (userWallets.length === 0)
        return sendToUser(ws, {
          type: "response",
          text: "You don't have any wallets to delete."
        });
      const nameProvided = (command.name || "").trim().toLowerCase();
      const matchedWallet = nameProvided
        ? userWallets.find((w) => w.name.toLowerCase().trim() === nameProvided)
        : null;
      if (!matchedWallet) {
        if (userWallets.length === 1) {
          command.name = userWallets[0].name;
        } else {
          ws._pending = { command, userText, summary };
          return sendToUser(ws, {
            type: "wallet_selection",
            text: "Which wallet would you like to delete?",
            wallets: userWallets.map((w) => ({
              id: w.$id,
              name: w.name,
              amount: w.amount
            })),
            awaitingWallet: true
          });
        }
      } else {
        command.name = matchedWallet.name;
      }
      const deletedId = await deleteWallet(userId, command.name);
      if (deletedId) {
        await rateLimiter.incrementAIUsage(userId);
        sendToUser(ws, { type: "wallet_deleted", walletId: deletedId });
        return sendToUser(ws, {
          type: "response",
          text: `Done! I've deleted the "${command.name}" wallet and all its transactions.`
        });
      }
      return sendToUser(ws, {
        type: "response",
        text: "I couldn't find that wallet."
      });
    }

    if (command.action === "set_budget") {
      if (!Number.isFinite(command.amount) || command.amount <= 0)
        return sendToUser(ws, {
          type: "response",
          text: "Please provide a valid positive amount for the budget."
        });
      const category = command.category || null;
      await setBudget(userId, command.amount, category);
      await rateLimiter.incrementAIUsage(userId);
      const label = category ? `${category} monthly` : "overall monthly";
      return sendToUser(ws, {
        type: "response",
        text: `✅ Budget set! I'll warn you when your ${label} spending reaches 80% of €${command.amount.toFixed(2)}, and alert you if you exceed it.`
      });
    }

    if (command.action === "get_budgets") {
      const budgets = await getUserBudgets(userId);
      await rateLimiter.incrementAIUsage(userId);
      if (budgets.length === 0) {
        return sendToUser(ws, {
          type: "response",
          text: 'You haven\'t set any budgets yet.\n\nTry saying:\n• "Set a monthly dining budget of €200"\n• "Set an overall monthly limit of €1000"'
        });
      }
      const spending = await getMonthlySpending(userId);
      const lines = ["📋 Your Monthly Budgets\n"];
      const budgetVisualization = budgets.map((b) => {
        const isOverall = b.category === null;
        const spent = isOverall
          ? spending.total
          : spending.byCategory[b.category] || 0;
        const pct = Math.round((spent / b.amount) * 100);
        const indicator = pct >= 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";
        const label = isOverall
          ? "Overall"
          : b.category.charAt(0).toUpperCase() + b.category.slice(1);
        lines.push(
          `${indicator} ${label.padEnd(16)} €${spent.toFixed(2)} / €${b.amount.toFixed(2)} (${pct}%)`
        );
        return {
          id: b.$id,
          category: b.category,
          label: isOverall ? "Overall" : b.category,
          limit: b.amount,
          spent,
          pct: Math.min(pct, 100),
          remaining: Math.max(b.amount - spent, 0)
        };
      });
      return sendToUser(ws, {
        type: "response",
        text: lines.join("\n"),
        visualization: { type: "budget_list", budgets: budgetVisualization }
      });
    }

    if (command.action === "delete_budget") {
      const category = command.category || null;
      const deleted = await deleteBudget(userId, category);
      await rateLimiter.incrementAIUsage(userId);
      const label = category ? `${category} monthly` : "overall monthly";
      if (deleted)
        return sendToUser(ws, {
          type: "response",
          text: `Done! Your ${label} budget has been removed.`
        });
      return sendToUser(ws, {
        type: "response",
        text: `I couldn't find a ${label} budget to delete.`
      });
    }

    if (command.action === "create_transaction") {
      const tx = command.transaction;
      if (!Number.isFinite(tx.amount) || tx.amount <= 0)
        return sendToUser(ws, {
          type: "response",
          text: `Invalid amount: "${tx.amount}". Please provide a valid positive number.`
        });
      const userWallets = await getUserWallets(userId);
      if (tx._walletResolved) {
        const match = userWallets.find(
          (w) =>
            w.name.toLowerCase().trim() === tx.walletId.toLowerCase().trim()
        );
        if (!match) throw new Error(`Wallet "${tx.walletId}" not found`);
        tx.walletId = match.$id;
      } else {
        const resolved = await resolveWallet(
          userId,
          tx.walletId,
          userText,
          userWallets
        );
        if (resolved.needsSelection) {
          ws._pending = { command, userText, summary };
          return sendToUser(ws, {
            type: "wallet_selection",
            text: "Which wallet would you like to add this to?",
            wallets: resolved.wallets.map((w) => ({
              id: w.$id,
              name: w.name,
              amount: w.amount
            })),
            awaitingWallet: true
          });
        }
        tx.walletId = resolved.walletId;
      }
      const transaction = await createTransaction(userId, tx);
      const updatedWallet = await updateWalletTotals(userId, tx.walletId, tx);
      await rateLimiter.incrementAIUsage(userId);
      sendToUser(ws, { type: "transaction_created", transaction });
      sendToUser(ws, { type: "wallet_updated", wallet: updatedWallet });
      const msg =
        tx.type === "expense"
          ? `Recorded a ${tx.category} expense of ${CONFIG.currency}${tx.amount.toFixed(2)}. Your ${updatedWallet.name} wallet is now ${CONFIG.currency}${updatedWallet.amount.toFixed(2)}.`
          : `Great! Logged ${CONFIG.currency}${tx.amount.toFixed(2)} income. Your ${updatedWallet.name} wallet is now ${CONFIG.currency}${updatedWallet.amount.toFixed(2)}.`;
      sendToUser(ws, { type: "response", text: msg });
      // Fire budget check detached — use userSockets map to get latest socket (original may be dead)
      if (tx.type === "expense") {
        checkBudgetAlerts(userId)
          .then((alerts) => {
            if (alerts.length > 0) {
              const latestWs = userSockets.get(userId);
              if (latestWs)
                sendToUser(latestWs, {
                  type: "budget_alert",
                  alerts,
                  text: formatBudgetAlertText(alerts)
                });
              sendBudgetAlertPush(userId, alerts);
            }
          })
          .catch((err) => console.error("Budget check error:", err));
      }
      return;
    }

    if (command.action === "create_transactions") {
      for (const txData of command.transactions)
        if (!Number.isFinite(txData.amount) || txData.amount <= 0)
          return sendToUser(ws, {
            type: "response",
            text: `Invalid amount (${txData.amount}). Please try again.`
          });
      const userWallets = await getUserWallets(userId);
      const alreadyResolved = command.transactions.every(
        (tx) => tx._walletResolved === true
      );
      if (!alreadyResolved) {
        const anyNeedsSelection = command.transactions.some(
          (tx) =>
            !userWallets.find(
              (w) =>
                w.name.toLowerCase().trim() ===
                (tx.walletId || "").toLowerCase().trim()
            )
        );
        if (userWallets.length > 1 && anyNeedsSelection) {
          ws._pending = { command, userText, summary };
          return sendToUser(ws, {
            type: "wallet_selection",
            text: "Which wallet would you like to add these transactions to?",
            wallets: userWallets.map((w) => ({
              id: w.$id,
              name: w.name,
              amount: w.amount
            })),
            awaitingWallet: true
          });
        }
      }
      const transactionSummaries = [];
      const createdTransactions = [];
      for (const txData of command.transactions) {
        try {
          let walletId;
          if (txData._walletResolved) {
            const match = userWallets.find(
              (w) =>
                w.name.toLowerCase().trim() ===
                txData.walletId.toLowerCase().trim()
            );
            if (!match)
              throw new Error(`Wallet "${txData.walletId}" not found`);
            walletId = match.$id;
          } else {
            const resolved = await resolveWallet(
              userId,
              txData.walletId,
              userText,
              userWallets
            );
            walletId = resolved.walletId;
          }
          const transactionInfo = {
            walletId,
            type: txData.type,
            amount: txData.amount,
            category: txData.category || null,
            description: txData.description || null
          };
          const transaction = await createTransaction(userId, transactionInfo);
          createdTransactions.push({ transaction, transactionInfo });
          sendToUser(ws, { type: "transaction_created", transaction });
          transactionSummaries.push(
            `${txData.type === "income" ? "+" : "-"}${CONFIG.currency}${txData.amount.toFixed(2)} (${txData.category})`
          );
        } catch (err) {
          console.error("Error creating transaction:", err);
          transactionSummaries.push(`❌ Failed: ${txData.category}`);
        }
      }
      const walletDeltas = new Map();
      for (const { transactionInfo } of createdTransactions) {
        if (!walletDeltas.has(transactionInfo.walletId))
          walletDeltas.set(transactionInfo.walletId, { income: 0, expense: 0 });
        const delta = walletDeltas.get(transactionInfo.walletId);
        if (transactionInfo.type === "income")
          delta.income += transactionInfo.amount;
        else delta.expense += transactionInfo.amount;
      }
      await Promise.all(
        Array.from(walletDeltas.entries()).map(async ([walletId, delta]) => {
          const walletDoc = await database.getDocument(
            CONFIG.dbId,
            CONFIG.walletCollectionId,
            walletId
          );
          verifyOwnership(walletDoc, userId, "userId");
          const updatedWallet = await database.updateDocument(
            CONFIG.dbId,
            CONFIG.walletCollectionId,
            walletId,
            {
              amount: walletDoc.amount + delta.income - delta.expense,
              totalIncome: walletDoc.totalIncome + delta.income,
              totalExpense: walletDoc.totalExpense + delta.expense
            }
          );
          sendToUser(ws, { type: "wallet_updated", wallet: updatedWallet });
        })
      );
      await rateLimiter.incrementAIUsage(userId);
      sendToUser(ws, {
        type: "response",
        text: `Perfect! I've recorded ${createdTransactions.length} transaction${createdTransactions.length !== 1 ? "s" : ""}:\n\n${transactionSummaries.join("\n")}`
      });
      // Fire budget check detached — use userSockets map to get latest socket (original may be dead)
      const hasExpenses = createdTransactions.some(
        (c) => c.transactionInfo.type === "expense"
      );
      if (hasExpenses) {
        checkBudgetAlerts(userId)
          .then((alerts) => {
            if (alerts.length > 0) {
              const latestWs = userSockets.get(userId);
              if (latestWs)
                sendToUser(latestWs, {
                  type: "budget_alert",
                  alerts,
                  text: formatBudgetAlertText(alerts)
                });
              sendBudgetAlertPush(userId, alerts);
            }
          })
          .catch((err) => console.error("Budget check error:", err));
      }
      return;
    }

    if (command.action === "delete_transaction") {
      const userWallets = await getUserWallets(userId);
      if (command._transactionResolved) {
        const txnToDelete = command._resolvedTransaction;
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
            text: `Deleted! The ${txnToDelete.type} of €${txnToDelete.amount.toFixed(2)} (${txnToDelete.category}) from "${txnToDelete.walletName}" has been removed.`
          });
        }
        return sendToUser(ws, {
          type: "response",
          text: "Something went wrong. Please try again."
        });
      }
      const candidates = await findTransactionCandidates(
        userId,
        command.amount,
        command.type || null,
        command.category || null,
        command.walletId || null,
        userWallets
      );
      if (candidates.length === 0)
        return sendToUser(ws, {
          type: "response",
          text: "I couldn't find a matching transaction."
        });
      const top = candidates[0];
      const second = candidates[1];
      const isClear = !second || top.score - second.score >= 100;
      if (isClear) {
        const txnToDelete = top.txn;
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
            text: `Deleted! The ${txnToDelete.type} of €${txnToDelete.amount.toFixed(2)} (${txnToDelete.category}) from "${txnToDelete.walletName}" has been removed.`
          });
        }
        return sendToUser(ws, {
          type: "response",
          text: "Something went wrong."
        });
      }
      ws._pending = { command, userText, summary };
      ws._pendingTransactions = candidates.slice(0, 4).map((c) => c.txn);
      return sendToUser(ws, {
        type: "transaction_selection",
        text: "I found a few matching transactions. Which one would you like to delete?",
        transactions: formatTransactionSelectionList(ws._pendingTransactions)
      });
    }

    if (command.action === "summary") {
      await rateLimiter.incrementAIUsage(userId);
      summary = await getUserFinancialSummary(userId);
      const dateObjects = {},
        last7Days = {};
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toLocaleDateString("de-DE", {
          month: "short",
          day: "2-digit"
        });
        dateObjects[key] = date;
        last7Days[key] = { income: 0, expense: 0 };
      }
      summary.transactions.forEach((tx) => {
        const key = new Date(tx.date).toLocaleDateString("de-DE", {
          month: "short",
          day: "2-digit"
        });
        if (last7Days[key]) {
          if (tx.type === "income") last7Days[key].income += tx.amount;
          else last7Days[key].expense += tx.amount;
        }
      });
      const chartData = Object.entries(last7Days).map(([key, d]) => ({
        label: dateObjects[key].toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric"
        }),
        income: d.income,
        expense: d.expense
      }));
      const summaryText = `Financial Summary\n\nBalance:  ${CONFIG.currency}${summary.totalBalance.toFixed(2)}\nIncome:   ${CONFIG.currency}${summary.totalIncome.toFixed(2)}\nExpenses: ${CONFIG.currency}${summary.totalExpense.toFixed(2)}\n\nWallets (${summary.wallets.length}):\n${summary.wallets.map((w) => `${w.name}: ${CONFIG.currency}${w.amount.toFixed(2)}`).join("\n")}`;
      return sendToUser(ws, {
        type: "response",
        text: summaryText,
        visualization: {
          type: "chart",
          chartType: "bar",
          data: chartData,
          title: "7-Day Income vs Expenses",
          xAxis: "label",
          yAxis: `Amount (${CONFIG.currency})`,
          series: [
            { name: "Income", color: "#00f5c4", key: "income" },
            { name: "Expenses", color: "#ff4d6d", key: "expense" }
          ]
        }
      });
    }

    if (command.action === "recent") {
      const recent = await getRecentTransactions(userId, command.limit || 5);
      await rateLimiter.incrementAIUsage(userId);
      if (recent.length === 0)
        return sendToUser(ws, {
          type: "response",
          text: "No transactions recorded yet. Start by adding one!"
        });
      const userWallets = await getUserWallets(userId);
      const walletMap = Object.fromEntries(
        userWallets.map((w) => [w.$id, w.name])
      );
      const enrichedTransactions = recent.map((t) => ({
        id: t.$id,
        date: t.date,
        type: t.type,
        amount: t.amount,
        category: t.category || "others",
        description: t.description || null,
        walletName: walletMap[t.walletId] || "Wallet",
        formattedAmount: `${t.type === "income" ? "+" : "-"}€${t.amount.toFixed(2)}`
      }));
      return sendToUser(ws, {
        type: "response",
        text: `Here are your last ${recent.length} transactions.`,
        visualization: {
          type: "transaction_list",
          transactions: enrichedTransactions
        }
      });
    }

    if (command.action === "analytics") {
      const userPlan = await rateLimiter.getUserPlan(userId);
      const isPro = userPlan === "pro";
      if (!isPro) {
        const simple = await getSimpleAnalytics(userId);
        await rateLimiter.incrementAIUsage(userId);
        if (!simple || simple.length === 0)
          return sendToUser(ws, {
            type: "response",
            text: "No expense data yet. Record some transactions first!"
          });
        const lines = [
          "📊 Top Spending Categories\n",
          ...simple.map(
            (c, i) =>
              `${i + 1}. ${c.category.padEnd(16)} ${CONFIG.currency}${c.amount.toFixed(2)}  (${c.percentage}%)`
          ),
          "\n✨ Upgrade to Pro for trends, anomaly detection, smart insights & charts."
        ];
        sendToUser(ws, {
          type: "upgrade_required",
          feature: "advanced_analytics",
          message: "Unlock full analytics with a Pro plan."
        });
        return sendToUser(ws, { type: "response", text: lines.join("\n") });
      }
      sendProgressUpdate(ws, "Crunching your spending data...");
      const [analytics, anomalies] = await Promise.all([
        getSpendingAnalytics(userId),
        detectSpendingAnomalies(userId)
      ]);
      await rateLimiter.incrementAIUsage(userId);
      if (!analytics || !analytics.hasData)
        return sendToUser(ws, {
          type: "response",
          text: "No expense data yet to analyze."
        });
      sendProgressUpdate(ws, "Generating smart insights...");
      const insights = await getSmartInsights(userId, analytics, anomalies);
      const lines = [];
      lines.push(
        `📊 Spending Analytics — ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`
      );
      lines.push("");
      lines.push(
        `This month:  ${CONFIG.currency}${analytics.thisMonthTotal.toFixed(2)}`
      );
      lines.push(
        `Last month:  ${CONFIG.currency}${analytics.lastMonthTotal.toFixed(2)}`
      );
      const monthDiff = analytics.thisMonthTotal - analytics.lastMonthTotal;
      if (analytics.lastMonthTotal > 0)
        lines.push(
          `Change:      ${monthDiff >= 0 ? "+" : ""}${CONFIG.currency}${monthDiff.toFixed(2)} (${((monthDiff / analytics.lastMonthTotal) * 100).toFixed(1)}%)`
        );
      lines.push("");
      lines.push("── Category Breakdown ──");
      analytics.categoryBreakdown.slice(0, 6).forEach((c) => {
        const arrow = c.trend === "up" ? "↑" : c.trend === "down" ? "↓" : "→";
        lines.push(
          `${arrow} ${c.category.padEnd(16)} ${CONFIG.currency}${c.amount.toFixed(2).padStart(8)}  (${c.percentage.toFixed(1)}%)  ${c.change > 0 ? "+" : ""}${c.change}% vs last month`
        );
      });
      if (anomalies.length > 0) {
        lines.push("");
        lines.push("── ⚠️  Anomalies ──");
        anomalies.forEach((a) =>
          lines.push(
            `${a.severity === "high" ? "🔴" : "🟡"} ${a.category}: ${CONFIG.currency}${a.currentAmount.toFixed(2)} — ${a.percentAbove}% above usual`
          )
        );
      }
      if (insights.length > 0) {
        lines.push("");
        lines.push("── 💡 Smart Insights ──");
        insights.forEach((i) => lines.push(`${i.emoji} ${i.text}`));
      }
      const categoryChartData = analytics.categoryBreakdown
        .filter((c) => c.amount > 0)
        .slice(0, 6)
        .map((c) => ({ label: c.category, value: c.amount }));
      const weeklyChartData = analytics.weeklyTrend.map((w) => ({
        label: w.week,
        amount: w.amount
      }));
      return sendToUser(ws, {
        type: "response",
        text: lines.join("\n"),
        visualization: {
          type: "multi_chart",
          charts: [
            {
              chartType: "bar",
              title: "Weekly Spending (Last 8 Weeks)",
              data: weeklyChartData,
              xAxis: "label",
              yAxis: `Amount (${CONFIG.currency})`,
              series: [{ name: "Spending", color: "#ff4d6d", key: "amount" }]
            },
            {
              chartType: "pie",
              title: "This Month by Category",
              data: categoryChartData,
              colors: [
                "#00f5c4",
                "#ff4d6d",
                "#ffd700",
                "#a78bfa",
                "#38bdf8",
                "#fb923c"
              ]
            }
          ],
          anomalies,
          insights
        }
      });
    }
  } catch (err) {
    console.error("Error processing command:", err);
    throw err;
  }
}

// ── WEBSOCKET SERVER ──────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  console.log("🔗 Client connected");
  ws._pending = null;
  ws._pendingTransactions = null;
  ws._userId = null;

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

    if (ws._userId !== userId) {
      ws._userId = userId;
      userSockets.set(userId, ws);
    }

    console.log(`📨 MSG: type=${data.type}, userId=${userId}`);

    try {
      if (data.type === "user_connected") {
        userSockets.set(userId, ws);
        return;
      }

      if (data.type === "register_push_token") {
        if (data.pushToken) await savePushToken(userId, data.pushToken);
        return;
      }

      if (data.type === "check_budget_after_transaction") {
        await handleManualTransactionBudgetCheck(ws, userId);
        return;
      }

      if (data.type === "check_allowance") {
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
        if (ws._pending) {
          const pending = ws._pending;
          const userWallets = await getUserWallets(userId);
          if (ws._pendingTransactions) {
            const pendingTxns = ws._pendingTransactions;
            const userInput = data.text.toLowerCase().trim();
            const matchedTxn = resolveTransactionFromInput(
              data.text,
              pendingTxns
            );
            if (matchedTxn) {
              ws._pendingTransactions = null;
              ws._pending = null;
              return await processCommand(
                ws,
                userId,
                {
                  action: "delete_transaction",
                  _transactionResolved: true,
                  _resolvedTransaction: matchedTxn
                },
                data.text,
                pending.summary
              );
            } else if (isCancelIntent(userInput)) {
              ws._pending = null;
              ws._pendingTransactions = null;
              return sendToUser(ws, {
                type: "response",
                text: "No problem, cancelled. What else can I help you with?"
              });
            } else {
              return sendToUser(ws, {
                type: "transaction_selection",
                text: "I couldn't match that. Reply with the number (1, 2, 3) or say the wallet/category name:",
                transactions: formatTransactionSelectionList(pendingTxns)
              });
            }
          }
          const matchedWallet = userWallets.find((w) =>
            data.text.toLowerCase().includes(w.name.toLowerCase().trim())
          );
          if (matchedWallet) {
            ws._pending = null;
            ws._pendingTransactions = null;
            if (pending.command.action === "create_transaction") {
              pending.command.transaction.walletId = matchedWallet.name;
              pending.command.transaction._walletResolved = true;
            } else if (pending.command.action === "create_transactions") {
              pending.command.transactions.forEach((tx) => {
                tx.walletId = matchedWallet.name;
                tx._walletResolved = true;
              });
            } else if (pending.command.action === "delete_wallet") {
              pending.command.name = matchedWallet.name;
            }
            return await processCommand(
              ws,
              userId,
              pending.command,
              matchedWallet.name,
              pending.summary
            );
          } else {
            return sendToUser(ws, {
              type: "wallet_selection",
              text: "I couldn't match that. Please choose one of:",
              wallets: userWallets.map((w) => ({
                id: w.$id,
                name: w.name,
                amount: w.amount
              })),
              awaitingWallet: true
            });
          }
        }
        const rateLimitCheck = await rateLimiter.canMakeAIRequest(userId);
        if (!rateLimitCheck.allowed)
          return sendToUser(ws, {
            type: "rate_limit_exceeded",
            remaining: rateLimitCheck.remaining,
            limit: rateLimitCheck.limit,
            text: `You've used your daily AI requests. Upgrade your plan for unlimited access!`
          });
        sendProgressUpdate(ws, "Analyzing your request...");
        const summary = await getUserFinancialSummary(userId);
        const command = await parseCommandWithAI(data.text, userId, summary);
        await processCommand(ws, userId, command, data.text, summary);
      } else if (data.type === "audio") {
        const rateLimitCheck = await rateLimiter.canMakeAIRequest(userId);
        if (!rateLimitCheck.allowed) {
          pendingAudio.delete(userId);
          return sendToUser(ws, {
            type: "rate_limit_exceeded",
            remaining: rateLimitCheck.remaining,
            limit: rateLimitCheck.limit,
            text: `You've used your daily AI requests. Upgrade your plan for unlimited access!`
          });
        }
        if (!pendingAudio.has(userId))
          pendingAudio.set(userId, {
            chunks: [],
            format: data.format || "m4a"
          });
        const audioPending = pendingAudio.get(userId);
        audioPending.chunks.push(Buffer.from(data.chunk, "base64"));
        if (data.isLast === true) {
          if (ws.readyState !== WebSocket.OPEN) {
            pendingAudio.delete(userId);
            return;
          }
          if (audioPending.chunks.length === 0) {
            pendingAudio.delete(userId);
            return sendToUser(ws, {
              type: "response",
              text: "No audio received."
            });
          }
          const audioData = audioPending;
          pendingAudio.delete(userId);
          try {
            sendProgressUpdate(ws, "Transcribing audio...");
            const text = await transcribeAudio(
              audioData.chunks,
              audioData.format
            );
            console.log("✅ Transcribed:", text);
            sendToUser(ws, {
              type: "response",
              text: `🎤 You said: "${text}"`
            });
            if (ws._pending) {
              const pending = ws._pending;
              const userWallets = await getUserWallets(userId);
              if (ws._pendingTransactions) {
                const pendingTxns = ws._pendingTransactions;
                const matchedTxn = resolveTransactionFromInput(
                  text,
                  pendingTxns
                );
                if (matchedTxn) {
                  ws._pendingTransactions = null;
                  ws._pending = null;
                  await processCommand(
                    ws,
                    userId,
                    {
                      action: "delete_transaction",
                      _transactionResolved: true,
                      _resolvedTransaction: matchedTxn
                    },
                    text,
                    pending.summary
                  );
                  return;
                } else if (isCancelIntent(text)) {
                  ws._pending = null;
                  ws._pendingTransactions = null;
                  sendToUser(ws, {
                    type: "response",
                    text: "No problem, cancelled."
                  });
                  return;
                } else {
                  sendToUser(ws, {
                    type: "transaction_selection",
                    text: "I couldn't match that. Please say the number or wallet/category:",
                    transactions: formatTransactionSelectionList(pendingTxns)
                  });
                  return;
                }
              }
              const matchedWallet = userWallets.find((w) =>
                text.toLowerCase().includes(w.name.toLowerCase().trim())
              );
              if (matchedWallet) {
                ws._pending = null;
                ws._pendingTransactions = null;
                if (pending.command.action === "create_transaction") {
                  pending.command.transaction.walletId = matchedWallet.name;
                  pending.command.transaction._walletResolved = true;
                } else if (pending.command.action === "create_transactions") {
                  pending.command.transactions.forEach((tx) => {
                    tx.walletId = matchedWallet.name;
                    tx._walletResolved = true;
                  });
                } else if (pending.command.action === "delete_wallet") {
                  pending.command.name = matchedWallet.name;
                }
                await processCommand(
                  ws,
                  userId,
                  pending.command,
                  matchedWallet.name,
                  pending.summary
                );
                return;
              } else {
                sendToUser(ws, {
                  type: "wallet_selection",
                  text: "I couldn't match that. Please choose one of:",
                  wallets: userWallets.map((w) => ({
                    id: w.$id,
                    name: w.name,
                    amount: w.amount
                  })),
                  awaitingWallet: true
                });
                return;
              }
            }
            sendProgressUpdate(ws, "Processing your request...");
            const summary = await getUserFinancialSummary(userId);
            const command = await parseCommandWithAI(text, userId, summary);
            await processCommand(ws, userId, command, text, summary);
          } catch (err) {
            console.error("❌ Transcription error:", err);
            sendToUser(ws, {
              type: "error",
              text: "Failed to transcribe audio. Please try again."
            });
          }
        }
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
    console.log("❌ Client disconnected");
    if (ws._userId) userSockets.delete(ws._userId);
  });
  ws.on("error", (err) => console.error("WebSocket error:", err));
});
