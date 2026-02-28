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
  transactionCollectionId: "683e28b6002b61669545",
  currency: "€",
  currencyCode: "EUR"
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
// FIX #4: Key pendingAudio by userId string instead of ws object
// so reconnects don't orphan stale buffers
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

// FIX #5: Wrap in try/finally so temp file is always deleted even if transcription throws
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
    } catch (cleanupErr) {
      console.warn("⚠️ Could not delete temp audio file:", cleanupErr.message);
    }
  }
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
      transactions: transactions.documents || [],
      wallets: wallets.documents.map((w) => ({
        name: w.name,
        amount: w.amount,
        totalIncome: w.totalIncome,
        totalExpense: w.totalExpense
      }))
    };

    wallets.documents.forEach((w) => {
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

// FIX #6: Sort ALL keywords by length descending across all categories so that
// longer/more-specific phrases (e.g. "food delivery") win over shorter ambiguous
// ones (e.g. "food" or "delivery") regardless of which category they belong to.
function detectCategory(text, type = "expense") {
  if (!text) return "others";

  const lowerText = text.toLowerCase().trim();

  // Build a flat list of { category, keyword } sorted by keyword length desc
  const allKeywords = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      allKeywords.push({ category, keyword });
    }
  }
  allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

  for (const { category, keyword } of allKeywords) {
    if (lowerText.includes(keyword)) {
      return category;
    }
  }

  return "others";
}

// --- Enhanced command parsing with multi-transaction support ---
// FIX #8: Accept pre-fetched financialSummary so callers don't need to fetch it twice
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
- Active Wallets: ${
      financialSummary.wallets.map((w) => w.name).join(", ") || "None"
    }
`;
  }

  const systemPrompt = `
You are an intelligent financial advisor AI for a German user. You understand natural language and can parse financial commands with high accuracy.

**LANGUAGE RULE - ABSOLUTE:**
Always respond in English only. Never respond in German or any other language, regardless of what language the user writes in.

**ABSOLUTE CURRENCY RULE:**
The user ONLY uses EUR (€) currency.
ALL amounts in the user's messages are ALREADY in EUR.
Currency Symbol: €
Country Code: DE
Locale: de-DE

${contextInfo}

Parse the user's message into JSON commands for wallet management. If multiple transactions are mentioned, return ALL of them.

**CATEGORY DETECTION - CRITICAL - MUST USE EXACT CATEGORIES:**
You MUST choose from these EXACT categories ONLY:
- groceries: buying food at supermarkets (EDEKA, REWE, ALDI, etc.)
- rent: monthly rent or housing payments
- utilities: electricity, water, gas, internet, phone bills
- transportation: gas, taxi, bus, train, car parking
- entertainment: movies, streaming (Netflix, Spotify), games, concerts
- dining: restaurants, cafes, coffee shops, takeout, food delivery
- health: doctor, pharmacy, gym, fitness, medical care
- insurance: insurance premiums and policies
- savings: putting money into savings
- clothing: clothes, shoes, fashion items
- personal: gifts, haircuts, vacations, self-care
- others: anything that doesn't fit above

**CRITICAL - DO NOT CONVERT, SCALE, OR INTERPRET AMOUNTS:**
- User says "50" → 50 EUR (NOT 50 USD or any conversion)
- User says "1200" → 1200 EUR (NOT dollars)
- User says "100" → 100 EUR
- NEVER apply USD logic, scaling, or assumptions
- NEVER assume any amount needs conversion
- Every numeric amount is a direct EUR value

Critical Rules:
1. Output ONLY valid JSON. No markdown, no text before or after.
2. Be extremely tolerant of casual speech and typos
3. Infer intent from context
4. Always try to find the right wallet (default to "main")
5. Extract numeric amounts EXACTLY as the user states them - this is the EUR amount
6. If multiple transactions are mentioned, return them ALL in a transactions array
7. Extract wallet name if mentioned (e.g., "BTC wallet", "savings account")
8. NEVER scale, multiply, divide, or adjust amounts - use them precisely as stated
9. The currency is ALWAYS EUR for this user - treat all amounts as EUR values
10. **CATEGORY DETECTION**: CHOOSE FROM THE 12 CATEGORIES ABOVE. Be specific and accurate.

Supported Commands:

CREATE_WALLET:
  Trigger words: add, create, make, open, new, setup, initialize
  Output: {"action":"create_wallet","name":"<wallet_name>"}

CREATE_TRANSACTION (SINGLE):
  Output: {
    "action":"create_transaction",
    "transaction":{
      "walletId":"<wallet_name_or_main>",
      "type":"income|expense",
      "amount":<number>,
      "category":"<ONE_OF_THE_12_CATEGORIES>",
      "description":"<optional>"
    }
  }

CREATE_TRANSACTIONS (MULTIPLE):
  If user mentions multiple transactions:
  {
    "action":"create_transactions",
    "transactions":[
      {
        "walletId":"<wallet_name_or_main>",
        "type":"income|expense",
        "amount":<number>,
        "category":"<ONE_OF_THE_12_CATEGORIES>",
        "description":"<optional>"
      }
    ]
  }

Examples:
- "I spent 200 on groceries and got 1200 salary"
  Output: {
    "action":"create_transactions",
    "transactions":[
      {"walletId":"main","type":"expense","amount":200,"category":"groceries","description":"groceries"},
      {"walletId":"main","type":"income","amount":1200,"category":"others","description":"salary"}
    ]
  }

- "spent 50 on coffee and 100 on gas"
  Output: {
    "action":"create_transactions",
    "transactions":[
      {"walletId":"main","type":"expense","amount":50,"category":"dining","description":"coffee"},
      {"walletId":"main","type":"expense","amount":100,"category":"transportation","description":"gas"}
    ]
  }

- "paid 800 rent"
  Output: {
    "action":"create_transaction",
    "transaction":{"walletId":"main","type":"expense","amount":800,"category":"rent","description":"rent"}
  }

DELETE_WALLET:
  Output: {"action":"delete_wallet","name":"<wallet_name>"}

DELETE_TRANSACTION:
  Output: {"action":"delete_transaction","amount":<number>,"type":"income|expense|null","category":"<category|null>"}

SUMMARY:
  Output: {"action":"summary"}

RECENT:
  Output: {"action":"recent","limit":5}

ANALYTICS:
  Output: {"action":"analytics"}

UNKNOWN:
  Output: {"action":"unknown"}
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

    let aiText = response.choices[0]?.message?.content?.trim();
    let parsed = JSON.parse(aiText);

    // POST-PROCESS: Apply local category detection if AI returned invalid/missing category
    const validCategories = Object.keys(CATEGORY_KEYWORDS);

    if (parsed.action === "create_transaction" && parsed.transaction) {
      if (
        !parsed.transaction.category ||
        !validCategories.includes(parsed.transaction.category)
      ) {
        parsed.transaction.category = detectCategory(
          parsed.transaction.description || text,
          parsed.transaction.type
        );
        console.log(
          `✅ Category corrected/detected: ${parsed.transaction.category}`
        );
      }
    }

    if (parsed.action === "create_transactions" && parsed.transactions) {
      parsed.transactions = parsed.transactions.map((txn) => {
        if (!txn.category || !validCategories.includes(txn.category)) {
          txn.category = detectCategory(txn.description || text, txn.type);
          console.log(`✅ Category corrected/detected: ${txn.category}`);
        }
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

// --- Enhanced AI response with financial insights ---
async function getAIAdvisoryResponse(text, financialSummary = null) {
  console.log("🧠 Generating advisory response for:", text);

  let contextInfo = "";
  if (financialSummary) {
    const balance = formatEUR(financialSummary.totalBalance);
    const income = formatEUR(financialSummary.totalIncome);
    const expenses = formatEUR(financialSummary.totalExpense);

    contextInfo = `
**USER FINANCIAL DATA (ALL IN EUR):**
- Total Balance: ${balance}
- Monthly Income: ${income}
- Monthly Expenses: ${expenses}
- Active Wallets: ${financialSummary.wallets.length}

${
  financialSummary.totalIncome > 0
    ? `- Savings Rate: ${(
        (1 - financialSummary.totalExpense / financialSummary.totalIncome) *
        100
      ).toFixed(1)}%`
    : ""
}

**WALLETS:**
${financialSummary.wallets
  .map((w) => `- ${w.name}: ${formatEUR(w.amount)}`)
  .join("\n")}
`;
  }

  const systemPrompt = `
You are a knowledgeable and friendly financial advisor for a German user in Frankfurt am Main, Germany.

**LANGUAGE RULE - ABSOLUTE:**
Always respond in English only. Never respond in German or any other language, regardless of what language the user writes in.

**MANDATORY - CURRENCY LOCK (NON-NEGOTIABLE - THIS IS CRITICAL):**
- User Location: Germany
- User Currency: EUR (€) ONLY - NEVER USD
- Locale: de-DE
- All amounts shown are already in EUR - NEVER convert
- NEVER mention dollars, USD, or any other currency
- NEVER give US-based financial advice
- NEVER suggest US investments or US financial practices
- NEVER compare to US standards
- Always respond as if the user is in Germany with EUR

${contextInfo}

**YOUR TASK:**
The user asked something outside your core capabilities. Respond warmly and naturally in 2-3 sentences maximum.

**CRITICAL CONSTRAINTS:**
1. Use ONLY EUR amounts - never USD
2. Use the € symbol for all currency references
3. Provide advice relevant to German financial practices
4. Reference German economic context if relevant
5. Do not convert or explain EUR as if it were USD
6. Do not apply US tax rules, US income levels, or US cost-of-living to your advice

**YOUR CORE CAPABILITIES:**
- Creating and managing wallets
- Recording income and expense transactions (in EUR)
- Deleting transactions
- Viewing financial summaries (in EUR)
- Tracking spending by category (in EUR)
- Providing general financial advice (Germany-based, EUR-only)

Be conversational, warm, and German-focused. All financial data you see is already in EUR.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.2,
      max_tokens: 150
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
    { amount, totalIncome, totalExpense }
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
      [Query.equal("uid", userId), Query.orderDesc("date"), Query.limit(limit)]
    );

    return transactions.documents.map((t) => ({
      ...t,
      date: new Date(t.date).toLocaleDateString("de-DE")
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
    transactions.documents.forEach((t) => {
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
// FIX #8: Accept pre-fetched summary as a param to avoid double DB calls
async function processCommand(
  ws,
  userId,
  command,
  userText = null,
  summary = null
) {
  try {
    // Only fetch summary if caller didn't already provide it
    if (!summary) {
      summary = await getUserFinancialSummary(userId);
    }

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

    // HANDLE SINGLE TRANSACTION
    if (command.action === "create_transaction") {
      const transactionInfo = command.transaction;

      // FIX #7: Validate amount before touching the DB
      if (
        !Number.isFinite(transactionInfo.amount) ||
        transactionInfo.amount <= 0
      ) {
        return sendToUser(ws, {
          type: "response",
          text: `Invalid amount: "${transactionInfo.amount}". Please provide a valid positive number.`
        });
      }

      const walletId = await getWalletId(
        userId,
        transactionInfo.walletId || "main"
      );
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
          ? `Recorded a ${transactionInfo.category} expense of ${CONFIG.currency}${transactionInfo.amount.toFixed(2)}. Your ${updatedWallet.name} wallet balance is now ${CONFIG.currency}${updatedWallet.amount.toFixed(2)}.`
          : `Great! Logged ${CONFIG.currency}${transactionInfo.amount.toFixed(2)} income from ${transactionInfo.category}. Your ${updatedWallet.name} wallet is now at ${CONFIG.currency}${updatedWallet.amount.toFixed(2)}.`;

      return sendToUser(ws, { type: "response", text: summaryText });
    }

    // FIX #1 + #2: HANDLE MULTIPLE TRANSACTIONS
    // - Batch wallet writes to avoid stale-read race condition on shared wallets
    // - Remove the mid-loop "Velora has completed your request!" spam
    if (command.action === "create_transactions") {
      const transactionSummaries = [];
      const createdTransactions = [];

      // FIX #7: Validate all amounts before any DB writes
      for (const txData of command.transactions) {
        if (!Number.isFinite(txData.amount) || txData.amount <= 0) {
          return sendToUser(ws, {
            type: "response",
            text: `Invalid amount (${txData.amount}) in one of your transactions. Please try again with valid amounts.`
          });
        }
      }

      // Step 1: Create all transaction documents; resolve wallet IDs per transaction
      for (const txData of command.transactions) {
        try {
          const walletId = await getWalletId(userId, txData.walletId || "main");
          const transactionInfo = {
            walletId,
            type: txData.type,
            amount: txData.amount,
            category: txData.category || null,
            description: txData.description || null
          };

          const transaction = await createTransaction(userId, transactionInfo);
          createdTransactions.push({ transaction, transactionInfo });

          // FIX #2: Only send transaction_created here — no per-item "completed" text
          sendToUser(ws, { type: "transaction_created", transaction });

          const prefix = txData.type === "income" ? "+" : "-";
          transactionSummaries.push(
            `${prefix}${CONFIG.currency}${txData.amount.toFixed(2)} (${txData.category})`
          );
        } catch (err) {
          console.error("Error creating individual transaction:", err);
          transactionSummaries.push(
            `❌ Failed: ${txData.category} transaction`
          );
        }
      }

      // Step 2: Compute net delta per wallet across all transactions
      // FIX #1: This replaces N sequential read→write per transaction with
      // one read→one write per unique wallet, eliminating the stale-read race condition
      const walletDeltas = new Map();
      for (const { transactionInfo } of createdTransactions) {
        const wid = transactionInfo.walletId;
        if (!walletDeltas.has(wid)) {
          walletDeltas.set(wid, { income: 0, expense: 0 });
        }
        const delta = walletDeltas.get(wid);
        if (transactionInfo.type === "income") {
          delta.income += transactionInfo.amount;
        } else {
          delta.expense += transactionInfo.amount;
        }
      }

      // Step 3: Apply batched delta — one DB read + one DB write per unique wallet
      const walletUpdatePromises = [];
      for (const [walletId, delta] of walletDeltas.entries()) {
        walletUpdatePromises.push(
          (async () => {
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

            console.log(`💰 Wallet batch-updated: ${updatedWallet.name}`);
            sendToUser(ws, { type: "wallet_updated", wallet: updatedWallet });
            return updatedWallet;
          })()
        );
      }

      await Promise.all(walletUpdatePromises);
      await rateLimiter.incrementAIUsage(userId);

      // FIX #2: Send ONE final summary response after everything is done
      const responseText = `Perfect! I've recorded ${createdTransactions.length} transaction${
        createdTransactions.length !== 1 ? "s" : ""
      }:\n\n${transactionSummaries.join("\n")}`;

      return sendToUser(ws, { type: "response", text: responseText });
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
          text: `Deleted! Your ${updatedWallet.name} balance is now ${CONFIG.currency}${updatedWallet.amount.toFixed(2)}.`
        });
      }
      return sendToUser(ws, {
        type: "response",
        text: "Something went wrong. Please try again."
      });
    }

    if (command.action === "summary") {
      await rateLimiter.incrementAIUsage(userId);

      // Build the 7-day window — store both the key (for matching) and the Date object
      // (for chart labels) so we never need to re-parse a localized German string.
      const dateObjects = {}; // dateKey  →  Date
      const last7Days = {}; // dateKey  →  { income, expense }

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toLocaleDateString("de-DE", {
          month: "short",
          day: "2-digit"
        });
        dateObjects[dateKey] = date;
        last7Days[dateKey] = { income: 0, expense: 0 };
      }

      // Bucket each transaction into the correct day
      summary.transactions.forEach((tx) => {
        const txKey = new Date(tx.date).toLocaleDateString("de-DE", {
          month: "short",
          day: "2-digit"
        });
        if (last7Days[txKey]) {
          if (tx.type === "income") last7Days[txKey].income += tx.amount;
          else last7Days[txKey].expense += tx.amount;
        }
      });

      // Build chart data — use the real Date object for the label (no broken re-parse)
      const chartData = Object.entries(last7Days).map(([dateKey, dayData]) => ({
        label: dateObjects[dateKey].toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric"
        }), // e.g. "Mon 24"
        income: dayData.income,
        expense: dayData.expense
      }));

      // Plain-text summary — zero markdown so React Native renders it cleanly
      const summaryText =
        `Financial Summary\n\n` +
        `Balance:  ${CONFIG.currency}${summary.totalBalance.toFixed(2)}\n` +
        `Income:   ${CONFIG.currency}${summary.totalIncome.toFixed(2)}\n` +
        `Expenses: ${CONFIG.currency}${summary.totalExpense.toFixed(2)}\n\n` +
        `Wallets (${summary.wallets.length}):\n` +
        summary.wallets
          .map((w) => `${w.name}: ${CONFIG.currency}${w.amount.toFixed(2)}`)
          .join("\n");

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

      if (recent.length === 0) {
        return sendToUser(ws, {
          type: "response",
          text: "No transactions recorded yet. Start by adding one!"
        });
      }

      const recentText =
        `📋 Recent Transactions:\n\n` +
        recent
          .map(
            (t) =>
              `${t.date} - ${t.type === "income" ? "+" : "-"}${CONFIG.currency}${t.amount.toFixed(2)} (${t.category})`
          )
          .join("\n");

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

      const analyticsText =
        `📈 Top Spending Categories:\n\n` +
        analytics
          .map(
            (a, i) =>
              `${i + 1}. ${a.category}: ${CONFIG.currency}${a.amount.toFixed(2)}`
          )
          .join("\n");

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

        // FIX #8: Fetch summary ONCE and pass it into both parse and process
        const summary = await getUserFinancialSummary(userId);
        const command = await parseCommandWithAI(data.text, userId, summary);
        await processCommand(ws, userId, command, data.text, summary);
      } else if (data.type === "audio") {
        console.log(
          `🎧 Received audio chunk - Chunk: ${data.chunkNumber}/${data.totalChunks}, Size: ${data.chunkSize}, IsLast: ${data.isLast}`
        );

        const rateLimitCheck = await rateLimiter.canMakeAIRequest(userId);

        if (!rateLimitCheck.allowed) {
          pendingAudio.delete(userId); // FIX #4: key by userId
          return sendToUser(ws, {
            type: "rate_limit_exceeded",
            remaining: rateLimitCheck.remaining,
            limit: rateLimitCheck.limit,
            text: `You've used your daily AI requests. Upgrade your plan for unlimited access!`
          });
        }

        // FIX #4: Initialize pending audio keyed by userId (not ws)
        if (!pendingAudio.has(userId)) {
          console.log("🎧 Initializing audio buffer for user:", userId);
          pendingAudio.set(userId, {
            chunks: [],
            format: data.format || "m4a"
          });
        }

        const pending = pendingAudio.get(userId);
        pending.chunks.push(Buffer.from(data.chunk, "base64"));
        console.log(
          `✅ Buffered chunk ${pending.chunks.length} (isLast=${data.isLast})`
        );

        if (data.isLast === true) {
          console.log(
            `🎧 LAST CHUNK DETECTED! Total chunks buffered: ${pending.chunks.length}`
          );

          // FIX #9: Abort early if client disconnected before we start processing
          if (ws.readyState !== WebSocket.OPEN) {
            pendingAudio.delete(userId);
            console.warn(
              "⚠️ Client disconnected before audio processing — aborting."
            );
            return;
          }

          if (pending.chunks.length === 0) {
            pendingAudio.delete(userId);
            console.error("❌ No chunks in buffer!");
            return sendToUser(ws, {
              type: "response",
              text: "No audio received.",
              hasVisualization: false
            });
          }

          const audioData = pending;
          pendingAudio.delete(userId);

          try {
            sendProgressUpdate(ws, "Transcribing audio...");
            console.log(
              `🎧 Starting transcription with ${audioData.chunks.length} chunks, format: ${audioData.format}`
            );

            const text = await transcribeAudio(
              audioData.chunks,
              audioData.format
            );
            console.log("✅ Transcribed:", text);

            sendToUser(ws, {
              type: "response",
              text: `🎤 You said: "${text}"`,
              hasVisualization: false
            });

            sendProgressUpdate(ws, "Processing your request...");

            // FIX #8: Fetch summary ONCE and pass to both parse and process
            const summary = await getUserFinancialSummary(userId);
            const command = await parseCommandWithAI(text, userId, summary);
            await processCommand(ws, userId, command, text, summary);
          } catch (transcriptionErr) {
            console.error("❌ Transcription error:", transcriptionErr);
            sendToUser(ws, {
              type: "error",
              text: "Failed to transcribe audio. Please try again.",
              hasVisualization: false
            });
          }
        } else {
          console.log(`📍 Waiting for more chunks (isLast=${data.isLast})...`);
        }
      }
    } catch (err) {
      console.error("Error processing message:", err);
      sendToUser(ws, {
        type: "error",
        text: err instanceof Error ? err.message : "An error occurred",
        hasVisualization: false
      });
    }
  });

  ws.on("close", () => {
    const userId = connectedUsers.get(ws);
    connectedUsers.delete(ws);
    // FIX #4: Clean up audio buffer by userId on disconnect
    if (userId) {
      pendingAudio.delete(userId);
    }
    console.log("❌ Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});
