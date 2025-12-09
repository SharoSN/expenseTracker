import {
  Account,
  Avatars,
  Client,
  Databases,
  ID,
  Models,
  Permission,
  Query,
  Role,
  Storage
} from "react-native-appwrite";

import { TransactionType } from "@/types";
import { Wallet } from "@/types";

// Appwrite config
export const config = {
  platform: "com.velora.ai",
  endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID,
  databaseId: process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID,
  bankCollectionId: process.env.EXPO_PUBLIC_APPWRITE_BANK_COLLECTION_ID,
  userCollectionId: process.env.EXPO_PUBLIC_APPWRITE_USER_COLLECTION_ID,
  userAvatars: process.env.EXPO_PUBLIC_APPWRITE_USER_AVATARS,
  userWalletId: process.env.EXPO_PUBLIC_APPWRITE_WALLET_COLLECTION_ID,
  expensesCollectionId: process.env.EXPO_PUBLIC_APPWRITE_EXPENSES_COLLECTION_ID,
  transactionCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_TRANSACTION_COLLECTION_ID
};

// Initialize Appwrite
export const client = new Client()
  .setEndpoint(config.endpoint!)
  .setProject(config.projectId!)
  .setPlatform(config.platform!);

export const avatar = new Avatars(client);
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// ✅ Helper: Create permissions for a specific user (read, update, delete)
const createUserPermissions = (userId: string) => [
  `read("user:${userId}")`,
  `update("user:${userId}")`,
  `delete("user:${userId}")`
];

// ✅ Helper: Always verify ownership before returning data
const verifyOwnership = (
  document: any,
  userId: string,
  userIdField: string = "userId"
) => {
  if (document[userIdField] !== userId) {
    throw new Error("Unauthorized: Document does not belong to this user");
  }
  return document;
};

// ✅ Simplified Sign Up with Email & Password
export const createUserAccount = async ({
  password,
  email,
  firstName,
  lastName
}: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) => {
  try {
    // Step 1: Create the account
    const newAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`
    );

    // Step 2: Create session FIRST (authenticate the user)
    const session = await account.createEmailPasswordSession(email, password);
    if (!session) {
      throw new Error("Login failed after signup.");
    }

    // Step 3: NOW create the user document (user is authenticated)
    await databases.createDocument(
      config.databaseId,
      config.userCollectionId,
      newAccount.$id,
      {
        userId: newAccount.$id,
        email,
        firstName,
        lastName
      }
    );

    return { newAccount, session };
  } catch (error) {
    console.error("Sign-up error:", error);
    throw error;
  }
};

export const loginWithEmail = async ({
  email,
  password
}: {
  email: string;
  password: string;
}) => {
  try {
    const session = await account.createEmailPasswordSession(email, password);
    return session;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    return await account.deleteSession("current");
  } catch (error) {
    console.error("Logout error:", error);
    return false;
  }
};

export const getCurrentUser = async () => {
  try {
    const user = await account.get();

    if (user?.$id) {
      const userDoc = await databases.getDocument(
        config.databaseId,
        config.userCollectionId,
        user.$id
      );

      return userDoc;
    }

    return null;
  } catch (error) {
    console.error("Get current user error:", error);
    return null;
  }
};

export const getFullUserData = async () => {
  try {
    const userAccount = await account.get();

    if (!userAccount) {
      return null;
    }

    const userDocument = await databases.getDocument(
      config.databaseId!,
      config.userCollectionId!,
      userAccount.$id
    );

    const fullUser = {
      $id: userAccount.$id,
      name: userAccount.name,
      email: userAccount.email,
      firstName: userDocument.firstName,
      lastName: userDocument.lastName,
      avatarUrl: userDocument.avatarUrl
    };

    return fullUser;
  } catch (error) {
    return null;
  }
};

export const getUserInfo = async (userId: string) => {
  try {
    return await databases.getDocument(
      config.databaseId,
      config.userCollectionId,
      userId
    );
  } catch (error) {
    console.error("Failed to fetch user info", error);
    return null;
  }
};

export const saveUserExpense = async (expenseData: any) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const response = await databases.createDocument(
      config.databaseId,
      config.expensesCollectionId,
      ID.unique(),
      { ...expenseData, userId: currentUser.$id },
      createUserPermissions(currentUser.$id)
    );
    return response;
  } catch (error) {
    console.error("Failed to save user expense:", error);
    return null;
  }
};

export const uploadAvatar = async (file: {
  name: string;
  type: string;
  size: number;
  uri: string;
}) => {
  try {
    const response = await storage.createFile(
      config.userAvatars,
      ID.unique(),
      file
    );

    const fileUrl = `https://fra.cloud.appwrite.io/v1/storage/buckets/${config.userAvatars}/files/${response.$id}/view?project=${config.projectId}`;

    return fileUrl;
  } catch (error) {
    console.error("Avatar upload failed:", error);
    return null;
  }
};

export const updateUserAvatar = async (userId: string, avatarUrl: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser?.$id !== userId) {
      throw new Error("Unauthorized: Cannot update another user's avatar");
    }

    const updatedUser = await databases.updateDocument(
      config.databaseId,
      config.userCollectionId,
      userId,
      { avatarUrl: avatarUrl }
    );
    return updatedUser;
  } catch (error) {
    console.error("Failed to update avatar in DB:", error);
    return null;
  }
};

export const updateName = async ({
  userId,
  firstName,
  lastName
}: {
  userId: string;
  firstName: string;
  lastName: string;
}) => {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser?.$id !== userId) {
      throw new Error("Unauthorized: Cannot update another user's name");
    }

    await account.updateName(`${firstName} ${lastName}`);

    const updatedDoc = await databases.updateDocument(
      config.databaseId,
      config.userCollectionId,
      userId,
      { firstName, lastName }
    );

    return updatedDoc;
  } catch (error) {
    console.error("Failed to update name:", error);
    return null;
  }
};

export const uploadWalletIcon = async (
  file: {
    name: string;
    type: string;
    size: number;
    uri: string;
  },
  userId: string
) => {
  try {
    const customFileName = `wallet-${userId}-${Date.now()}-${file.name}`;

    const response = await storage.createFile(config.userAvatars, ID.unique(), {
      ...file,
      name: customFileName
    });
    const fileUrl = `https://fra.cloud.appwrite.io/v1/storage/buckets/${config.userAvatars}/files/${response.$id}/view?project=${config.projectId}`;
    return fileUrl;
  } catch (error) {
    console.error("Wallet icon upload failed:", error);
    return null;
  }
};

export const createUpdateWallet = async ({
  userId,
  name,
  imageUrl,
  walletId
}: {
  userId: string;
  name: string;
  imageUrl: string;
  walletId?: string;
}) => {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser?.$id !== userId) {
      throw new Error("Unauthorized: Cannot manage another user's wallets");
    }

    if (walletId) {
      const existingWallet = await databases.getDocument(
        config.databaseId,
        config.userWalletId,
        walletId
      );
      verifyOwnership(existingWallet, userId, "userId");

      const updatedWallet = await databases.updateDocument(
        config.databaseId,
        config.userWalletId,
        walletId,
        {
          name,
          name_lower: name.trim().toLowerCase(),
          image: imageUrl
        }
      );

      return updatedWallet;
    } else {
      const existingWallets = await databases.listDocuments(
        config.databaseId,
        config.userWalletId,
        [Query.equal("userId", userId), Query.equal("name", name)]
      );

      if (existingWallets.total > 0) {
        throw new Error("A wallet with this name already exists.");
      }

      // ✅ Create wallet with user permissions
      const wallet = await databases.createDocument(
        config.databaseId,
        config.userWalletId,
        ID.unique(),
        {
          userId,
          name,
          name_lower: name.trim().toLowerCase(),
          image: imageUrl,
          totalIncome: 0,
          totalExpense: 0,
          amount: 0,
          created: new Date().toISOString()
        },
        createUserPermissions(userId)
      );

      return wallet;
    }
  } catch (error) {
    console.error("Wallet creation/update failed:", error);
    return null;
  }
};

export const getWalletById = async (walletId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const wallet = await databases.getDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );

    return verifyOwnership(wallet, currentUser.$id, "userId");
  } catch (error) {
    console.error("Error fetching wallet by ID:", error);
    return null;
  }
};

export const deleteUserWalletWithImage = async (walletId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const wallet = await databases.getDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );

    verifyOwnership(wallet, currentUser.$id, "userId");

    const transactions = await databases.listDocuments(
      config.databaseId,
      config.transactionCollectionId,
      [Query.equal("walletId", walletId)]
    );

    for (const transaction of transactions.documents) {
      verifyOwnership(transaction, currentUser.$id, "uid");
      await handleDeleteTransaction(transaction.$id);
    }

    const imageUrl: string = wallet.image;
    let fileId = null;

    if (imageUrl) {
      const regex = /\/files\/([^/]+)\/view/;
      const match = imageUrl.match(regex);
      if (match && match[1]) {
        fileId = match[1];
      }
    }

    await databases.deleteDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );

    if (fileId) {
      await storage.deleteFile(config.userAvatars, fileId);
    }

    return true;
  } catch (error) {
    console.error("Failed to delete wallet and image:", error);
    return false;
  }
};

export const deleteUserWallet = async (walletId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const wallet = await databases.getDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );

    verifyOwnership(wallet, currentUser.$id, "userId");

    const result = await databases.deleteDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );
    return result;
  } catch (error) {
    console.error("Error deleting wallet:", error);
    return null;
  }
};

export const getUserWallets = async (
  userId: string
): Promise<Models.DocumentList<Wallet>> => {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser?.$id !== userId) {
      throw new Error("Unauthorized: Cannot fetch another user's wallets");
    }

    if (!userId) {
      console.error("[getUserWallets] No userId provided");
      return { total: 0, documents: [] };
    }

    if (!config.databaseId || !config.userWalletId) {
      console.error("[getUserWallets] Missing database config");
      return { total: 0, documents: [] };
    }

    const result = await databases.listDocuments<Wallet>(
      config.databaseId,
      config.userWalletId,
      [Query.equal("userId", userId)]
    );

    return result;
  } catch (error: any) {
    console.error("[getUserWallets] ❌ Error:", {
      message: error?.message,
      code: error?.code,
      type: error?.type,
      userId
    });

    return { total: 0, documents: [] };
  }
};

export const getUserTransaction = async (id: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const userTransaction = await databases.getDocument(
      config.databaseId,
      config.transactionCollectionId,
      id
    );

    return verifyOwnership(userTransaction, currentUser.$id, "uid");
  } catch (error) {
    console.error("No user transaction found", error);
    return null;
  }
};

export const getUserTransactions = async (userId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser?.$id !== userId) {
      throw new Error("Unauthorized: Cannot fetch another user's transactions");
    }

    const response = await databases.listDocuments(
      config.databaseId,
      config.transactionCollectionId,
      [Query.equal("uid", userId)]
    );
    return response.documents;
  } catch (error) {
    console.error("Error getting transactions", error);
    return [];
  }
};

export const updateTransactions = async (walletId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const wallet = await databases.getDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );

    verifyOwnership(wallet, currentUser.$id, "userId");

    const result = await databases.updateDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );
    return result;
  } catch (error) {
    console.error("Error updating transaction");
    return null;
  }
};

export const updateWalletForNewTransaction = async (
  walletId: string,
  amount: number,
  type: "income" | "expense",
  reverse = false
) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const wallet = await databases.getDocument(
      config.databaseId,
      config.userWalletId,
      walletId
    );

    verifyOwnership(wallet, currentUser.$id, "userId");

    if (!wallet) {
      throw new Error("Wallet not found!");
    }

    const updatedIncome = Number(wallet.totalIncome || 0);
    const updatedExpense = Number(wallet.totalExpense || 0);
    const amt = Number(amount);

    if (isNaN(updatedIncome) || isNaN(updatedExpense) || isNaN(amt)) {
      throw new Error("Invalid numeric values in wallet or transaction.");
    }

    let newIncome = updatedIncome;
    let newExpense = updatedExpense;

    if (type === "income") {
      newIncome = reverse ? updatedIncome - amt : updatedIncome + amt;
    } else {
      newExpense = reverse ? updatedExpense - amt : updatedExpense + amt;
    }

    newIncome = Math.max(newIncome, 0);
    newExpense = Math.max(newExpense, 0);
    const newAmount = newIncome - newExpense;

    const updatedWallet = await databases.updateDocument(
      config.databaseId,
      config.userWalletId,
      walletId,
      {
        amount: newAmount,
        totalIncome: newIncome,
        totalExpense: newExpense
      }
    );

    return updatedWallet;
  } catch (error: any) {
    console.error("❌ Error updating wallet:", error.message);
    throw error;
  }
};

export const createOrUpdateTransaction = async (
  transactionData: Partial<TransactionType>
) => {
  try {
    const currentUser = await getCurrentUser();
    const uid = currentUser?.$id;
    if (!uid) return { success: false, msg: "No user found!" };

    const { id, type, walletId, amount, category, date, description, image } =
      transactionData;

    if (!amount || amount <= 0 || !walletId || !type) {
      return { success: false, msg: "Invalid transaction data!" };
    }

    const wallet = await databases.getDocument(
      config.databaseId!,
      config.userWalletId!,
      walletId
    );

    verifyOwnership(wallet, uid, "userId");

    const transactionPayload = {
      type,
      amount,
      walletId,
      uid,
      category: category || "",
      date: date || new Date().toISOString(),
      description: description || "",
      ...(image && { image })
    };

    let transaction;

    if (id) {
      const existingTransaction = await databases.getDocument(
        config.databaseId!,
        config.transactionCollectionId!,
        id
      );

      if (!existingTransaction) {
        return { success: false, msg: "Transaction not found!" };
      }

      verifyOwnership(existingTransaction, uid, "uid");

      await updateWalletForNewTransaction(
        existingTransaction.walletId,
        existingTransaction.amount,
        existingTransaction.type,
        true
      );

      await updateWalletForNewTransaction(walletId, amount, type, false);

      transaction = await databases.updateDocument(
        config.databaseId!,
        config.transactionCollectionId!,
        id,
        transactionPayload
      );
    } else {
      await updateWalletForNewTransaction(walletId, amount, type, false);

      // ✅ Create transaction with user permissions
      transaction = await databases.createDocument(
        config.databaseId!,
        config.transactionCollectionId!,
        ID.unique(),
        transactionPayload,
        createUserPermissions(uid)
      );
    }

    return {
      success: true,
      transaction: {
        ...transaction,
        id: transaction.$id
      }
    };
  } catch (err: any) {
    console.error("Error creating/updating transaction:", err);
    return {
      success: false,
      msg: err?.message || "Unexpected error occurred."
    };
  }
};

export const handleDeleteTransaction = async (transactionId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const transaction = await databases.getDocument(
      config.databaseId!,
      config.transactionCollectionId!,
      transactionId
    );

    if (!transaction) {
      return false;
    }

    verifyOwnership(transaction, currentUser.$id, "uid");

    await updateWalletForNewTransaction(
      transaction.walletId,
      transaction.amount,
      transaction.type,
      true
    );

    await databases.deleteDocument(
      config.databaseId!,
      config.transactionCollectionId!,
      transactionId
    );

    if (transaction.image) {
      await storage.deleteFile(config.userAvatars!, transaction.image);
    }

    return true;
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return false;
  }
};

export const removeTransactionReceipt = async (transactionId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const transaction = await databases.getDocument(
      config.databaseId,
      config.transactionCollectionId!,
      transactionId
    );

    verifyOwnership(transaction, currentUser.$id, "uid");

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (!transaction.image) {
      console.warn("No receipt image to remove");
      return { success: false, msg: "No receipt image found" };
    }

    await storage.deleteFile(config.userAvatars!, transaction.image);

    const updatedTransaction = await databases.updateDocument(
      config.databaseId!,
      config.transactionCollectionId!,
      transactionId,
      { image: null }
    );

    return { success: true, transaction: updatedTransaction };
  } catch (error) {
    console.error("Error removing transaction receipt:", error);
    return { success: false, msg: "Failed to remove receipt" };
  }
};

export const removeWalletIcon = async (walletId: string) => {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User not authenticated");

    const wallet = await getWalletById(walletId);

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (!wallet.image) {
      console.warn("No wallet icon to remove");
      return { success: false, msg: "No wallet icon found" };
    }

    const regex = /\/files\/([^/]+)\/view/;
    const match = wallet.image.match(regex);
    let fileId = null;

    if (match && match[1]) {
      fileId = match[1];
    }

    if (fileId) {
      await storage.deleteFile(config.userAvatars!, fileId);
    }

    const updatedWallet = await databases.updateDocument(
      config.databaseId!,
      config.userWalletId!,
      walletId,
      { image: null }
    );

    return { success: true, wallet: updatedWallet };
  } catch (error) {
    console.error("Error removing wallet icon:", error);
    return { success: false, msg: "Failed to remove wallet icon" };
  }
};
