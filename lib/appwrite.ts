import {
  Account,
  Avatars,
  Client,
  Databases,
  ID,
  Models,
  Query,
  Storage,
} from "react-native-appwrite";

import * as DocumentPicker from "expo-document-picker";

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
    process.env.EXPO_PUBLIC_APPWRITE_TRANSACTION_COLLECTION_ID,
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

// ✅ Simplified Sign Up with Email & Password
export const createUserAccount = async ({
  password,
  email,
  firstName,
  lastName,
}: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) => {
  try {
    // Create the user in Appwrite authentication system
    const newAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`,
    );

    await databases.createDocument(
      config.databaseId,
      config.userCollectionId,
      newAccount.$id,
      {
        userId: newAccount.$id,
        email,
        firstName,
        lastName,
      },
    );

    // Now, log the user in automatically
    const session = await account.createEmailPasswordSession(email, password);
    if (!session) {
      console.error("Login failed after signup.");
      throw new Error("Login failed after signup.");
    }

    return { newAccount, session };
  } catch (error) {
    console.error("Sign-up error:", error);
    throw error;
  }
};

export const loginWithEmail = async ({
  email,
  password,
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

// ✅ Logout current user
export const logout = async () => {
  try {
    return await account.deleteSession("current");
  } catch (error) {
    console.error("Logout error:", error);
    return false;
  }
};

// ✅ Get current logged in user
export const getCurrentUser = async () => {
  try {
    const user = await account.get();

    if (user?.$id) {
      const userDoc = await databases.getDocument(
        config.databaseId,
        config.userCollectionId,
        user.$id,
      );

      return userDoc;
    }

    return null;
  } catch (error) {
    console.error("Get current suer error:", error);
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
      userAccount.$id,
    );

    const fullUser = {
      $id: userAccount.$id,
      name: userAccount.name,
      email: userAccount.email,
      firstName: userDocument.firstName,
      lastName: userDocument.lastName,
      avatarUrl: userDocument.avatarUrl,
    };

    return fullUser;
  } catch (error) {
    return null;
  }
};

// ✅ Get user info from database
export const getUserInfo = async (userId: string) => {
  try {
    return await databases.getDocument(
      config.databaseId,
      config.userCollectionId,
      userId,
    );
  } catch (error) {
    console.error("Failed to fetch user info", error);
    return null;
  }
};

export const saveUserExpense = async (expenseData: ExpenseData) => {
  try {
    const response = await databases.createDocument(
      config.databaseId, // your database ID
      config.expensesCollectionId, // your expenses collection ID
      ID.unique(), // generate unique ID for the document
      expenseData, // the actual expense data (amount, category, etc.)
    );
    return response;
  } catch (error) {
    console.error("Failed to save user expense:", error);
    return null;
  }
};

export const pickDocument = async () => {
  const result = await DocumentPicker.getDocumentAsync({ type: "image/*" });

  if (result.assets && result.assets[0]) {
    return {
      name: result.assets[0].name,
      type: result.assets[0].mimeType,
      size: result.assets[0].size,
      uri: result.assets[0].uri,
    };
  }

  return null;
};

export const uploadAvatar = async (file: {
  name: string;
  type: string;
  size: number;
  uri: string;
}) => {
  try {
    const response = await storage.createFile(
      config.userAvatars, // Your BUCKET_ID
      ID.unique(),
      file,
    );

    // Now use getFile to get the direct file URL
    const fileUrl = `https://fra.cloud.appwrite.io/v1/storage/buckets/${config.userAvatars}/files/${response.$id}/view?project=${config.projectId}`;

    return fileUrl; // Return the direct file URL
  } catch (error) {
    console.error("Avatar upload failed:", error);
    return null;
  }
};

export const uploadReceipt = async (file: {
  uri: string;
  mimeType: string;
  name: string;
  size?: number;
}) => {
  try {

    const uploadedFile = await storage.createFile(
      config.userAvatars,
      ID.unique(),
      file as any, // Cast to any if TypeScript complains, or define a more precise type
    );
    return uploadedFile; // Return the uploaded file object from Appwrite
  } catch (error) {
    console.error("Error uploading receipt:", error);
    throw error;
  }
};

export const getReceiptUrlById = (
  fileId: string | null | undefined,
): string | null => {
  if (!fileId) {
    return null;
  }

  return `https://fra.cloud.appwrite.io/v1/storage/buckets/${config.userAvatars}/files/${fileId}/view?project=${config.projectId}`;
};

export const updateUserAvatar = async (userId: string, avatarUrl: string) => {
  try {
    const updatedUser = await databases.updateDocument(
      config.databaseId,
      config.userCollectionId,
      userId,
      {
        avatarUrl: avatarUrl,
      },
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
  lastName,
}: {
  userId: string; // your Appwrite user document ID
  firstName: string;
  lastName: string;
}) => {
  try {
    // 1. Update Auth name (Account)
    await account.updateName(`${firstName} ${lastName}`);

    // 2. Update user document in your database
    const updatedDoc = await databases.updateDocument(
      config.databaseId, // replace with your database ID
      config.userCollectionId, // replace with your users collection ID
      userId,
      {
        firstName,
        lastName,
      },
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
  userId: string,
) => {
  try {
    const customFileName = `wallet-${userId}-${Date.now()}-${file.name}`;

    const response = await storage.createFile(config.userAvatars, ID.unique(), {
      ...file,
      name: customFileName,
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
  walletId, // optional for updating
}: {
  userId: string;
  name: string;
  imageUrl: string;
  walletId?: string;
}) => {
  try {
    if (walletId) {
      // 🛠️ Update existing wallet
      const updatedWallet = await databases.updateDocument(
        config.databaseId,
        config.userWalletId,
        walletId,
        {
          name,
          name_lower: name.trim().toLowerCase(),

          image: imageUrl,
        },
      );

      return updatedWallet;
    } else {
      // 🔍 Check for existing wallet with same name
      const existingWallets = await databases.listDocuments(
        config.databaseId,
        config.userWalletId,
        [Query.equal("userId", userId), Query.equal("name", name)],
      );

      if (existingWallets.total > 0) {
        throw new Error("A wallet with this name already exists.");
      }

      // ✨ Create new wallet
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
          created: new Date().toISOString(),
        },
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
    const wallet = await databases.getDocument(
      config.databaseId,
      config.userWalletId,
      walletId,
    );
    return wallet;
  } catch (error) {
    console.error("Error fetching wallet by ID:", error);
    return null;
  }
};

export const deleteUserWalletWithImage = async (walletId: string) => {
  try {
    const wallet = await getWalletById(walletId);
    if (!wallet) throw new Error("Wallet not found");

    const transactions = await databases.listDocuments(
      config.databaseId,
      config.transactionCollectionId,
      [Query.equal("walletId", walletId)],
    );

    for (const transaction of transactions.documents) {
      await handleDeleteTransaction(transaction.$id);
    }

    // 2. Extract the fileId from wallet.image URL (assuming it exists)
    const imageUrl: string = wallet.image;
    let fileId = null;

    if (imageUrl) {
      const regex = /\/files\/([^/]+)\/view/;
      const match = imageUrl.match(regex);
      if (match && match[1]) {
        fileId = match[1];
      }
    }

    // 3. Delete the wallet document
    await databases.deleteDocument(
      config.databaseId,
      config.userWalletId,
      walletId,
    );

    // 4. If fileId found, delete the file from storage bucket
    if (fileId) {
      await storage.deleteFile(config.userAvatars, fileId);
    }

    return true;
  } catch (error) {
    console.error("Failed to delete wallet and image:", error);
    return false;
  }
};

export const getUserWallets = async (
  userId: string,
): Promise<Models.DocumentList<Wallet>> => {

  try {
    if (!userId) {
      console.error('[getUserWallets] No userId provided');
      return { total: 0, documents: [] };
    }

    if (!config.databaseId || !config.userWalletId) {
      console.error('[getUserWallets] Missing database config');
      return { total: 0, documents: [] };
    }

    const result = await databases.listDocuments<Wallet>(
      config.databaseId,
      config.userWalletId,
      [Query.equal("userId", userId)]
    );


    return result;
  } catch (error: any) {
    console.error('[getUserWallets] ❌ Error:', {
      message: error?.message,
      code: error?.code,
      type: error?.type,
      userId
    });

    return { total: 0, documents: [] };
  }
};

export const deleteUserWallet = async (walletId: string) => {
  try {
    const result = await databases.deleteDocument(
      config.databaseId,
      config.userWalletId,
      walletId,
    );
    return result;
  } catch (error) {
    console.error("Error deleting wallet:", error);
    return null;
  }
};

export const getUserTransaction = async (id: string) => {
  try {
    const userTransaction = await databases.getDocument(
      config.databaseId,
      config.transactionCollectionId,
      id,
    );
    return userTransaction;
  } catch (error) {
    console.error("No user transaction found", error);
    return null;
  }
};

export const updateTransactions = async (walletId: string) => {
  try {
    const result = await databases.updateDocument(
      config.databaseId,
      config.userWalletId,
      walletId,
    );
    return result;
  } catch (error) {
    console.error("Error updating transaction ");
    return null;
  }
};

export const getUserTransactions = async (userId: string) => {
  try {
    const response = await databases.listDocuments(
      config.databaseId,
      config.transactionCollectionId,
      [Query.equal("uid", userId)],
    );
    return response.documents; // array of transactions
  } catch (error) {
    console.error("Error getting transactions", error);
    return [];
  }
};



export const updateWalletForNewTransaction = async (
  walletId: string,
  amount: number,
  type: "income" | "expense",
  reverse = false,
) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `Updating wallet: walletId=${walletId} amount=${amount} type=${type} reverse=${reverse}`,
    );
  }

  try {
    const wallet = await databases.getDocument(
      config.databaseId,
      config.userWalletId,
      walletId,
    );
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
        totalExpense: newExpense,
      },
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("✅ Wallet updated:", updatedWallet);
    }
    return updatedWallet;
  } catch (error: any) {
    console.error("❌ Error updating wallet:", error.message);
    throw error;
  }
};

export const createOrUpdateTransaction = async (
  transactionData: Partial<TransactionType>,
) => {
  try {
    const { id, type, walletId, amount, category, date, description, image } =
      transactionData;

    if (!amount || amount <= 0 || !walletId || !type) {
      return { success: false, msg: "Invalid transaction data!" };
    }

    const currentUser = await getCurrentUser();
    const uid = currentUser?.$id;
    if (!uid) return { success: false, msg: "No user found!" };

    const wallet = await databases.getDocument(
      config.databaseId!,
      config.userWalletId!,
      walletId,
    );

    if (!wallet) return { success: false, msg: "Wallet not found!" };

    const transactionPayload = {
      type,
      amount,
      walletId,
      uid,
      category: category || "",
      date: date || new Date().toISOString(),
      description: description || "",
      ...(image && { image }),
    };

    let transaction;

    if (id) {
      const existingTransaction = await databases.getDocument(
        config.databaseId!,
        config.transactionCollectionId!,
        id,
      );
      if (!existingTransaction) {
        return { success: false, msg: "Transaction not found!" };
      }

      // Reverse old transaction
      await updateWalletForNewTransaction(
        existingTransaction.walletId,
        existingTransaction.amount,
        existingTransaction.type,
        true,
      );

      // Apply new transaction
      await updateWalletForNewTransaction(walletId, amount, type, false);

      transaction = await databases.updateDocument(
        config.databaseId!,
        config.transactionCollectionId!,
        id,
        transactionPayload,
      );
    } else {
      // Apply transaction
      await updateWalletForNewTransaction(walletId, amount, type, false);

      transaction = await databases.createDocument(
        config.databaseId!,
        config.transactionCollectionId!,
        ID.unique(),
        transactionPayload,
      );
    }

    return {
      success: true,
      transaction: {
        ...transaction,
        id: transaction.$id,
      },
    };
  } catch (err: any) {
    console.error("Error creating/updating transaction:", err);
    return {
      success: false,
      msg: err?.message || "Unexpected error occurred.",
    };
  }
};

export const handleDeleteTransaction = async (transactionId: string) => {
  try {
    const transaction = await databases.getDocument(
      config.databaseId!,
      config.transactionCollectionId!,
      transactionId,
    );

    if (!transaction) {
      return false;
    }

    // Revert the wallet balance
    await updateWalletForNewTransaction(
      transaction.walletId,
      transaction.amount,
      transaction.type,
      true, // Mark as reversal
    );

    // Delete the transaction document
    await databases.deleteDocument(
      config.databaseId!,
      config.transactionCollectionId!,
      transactionId,
    );

    // If there's an associated image, delete it from storage
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
    const transaction = await databases.getDocument(
      config.databaseId,
      config.transactionCollectionId!,
      transactionId,
    );
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
      {
        image: null,
      },
    );

    return { success: true, transaction: updatedTransaction };
  } catch (error) {
    console.error("Error removing transaction receipt:", error);
    return { success: false, msg: "Failed to remove receipt" };
  }
};

export const removeWalletIcon = async (walletId: string) => {
  try {
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
      { image: null },
    );
    return { success: true, wallet: updatedWallet };
  } catch (error) { }
};
