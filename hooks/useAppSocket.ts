// hooks/useAppSocket.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "@/lib/walletStore";

const WS_PORT = 3000;

export interface Wallet {
  $id: string;
  [key: string]: any;
}

interface Transaction {
  $id: string;
  walletId: string;
  type: "income" | "expense";
  amount: number;
  [key: string]: any;
}

interface Allowance {
  remaining: number;
  limit: number;
  resetTime: string;
}

interface WSMessage {
  type: string;
  wallet?: Wallet;
  walletId?: string;
  transactionId?: string;
  transaction?: Transaction;
  allowance?: Allowance;
  text?: string;
}

export function useAppSocket(userId: string | null) {
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [animationTrigger, setAnimationTrigger] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [remainingAllowance, setRemainingAllowance] = useState<Allowance | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const queryClient = useQueryClient();
  const { setWallets, setTransactions, wallets, transactions } = useWalletStore();

  // Send message
  const sendMessage = useCallback(
    (data: any) => {
      if (!userId) {
        console.warn("sendMessage skipped: no userId yet", data);
        return;
      }

      if (!isConnected || !wsRef.current?.readyState === WebSocket.OPEN) {
        console.warn("Cannot send message: WebSocket not connected");
        return;
      }

      const payload = { ...data, userId };
      wsRef.current.send(JSON.stringify(payload));
      console.log("📤 Message sent:", data.type);
    },
    [userId, isConnected]
  );

  // Check remaining allowance
  const checkRemainingAllowance = useCallback(() => {
    if (!isConnected) {
      console.warn("Cannot check allowance: WebSocket not connected");
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot check allowance: WebSocket not ready");
      return;
    }

    const payload = { type: "check_allowance", userId };
    wsRef.current.send(JSON.stringify(payload));
    console.log("📊 Checking remaining allowance...");
  }, [userId, isConnected]);

  const triggerAnimation = useCallback(
    (name: string) => setAnimationTrigger(name),
    []
  );

  const clearAnimationTrigger = useCallback(
    () => setAnimationTrigger(null),
    []
  );

  const clearLastMessage = useCallback(() => {
    setLastMessage(null);
  }, []);

  // Handle wallet updates
  const handleWalletCreated = useCallback((wallet: Wallet) => {
    console.log("💰 Wallet created:", wallet);
    setWallets([...wallets, wallet]);
    queryClient.setQueryData(["wallets", userId], (old: Wallet[] | undefined) => {
      return old ? [...old, wallet] : [wallet];
    });
    queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
    setAnimationTrigger("wallet_created");
  }, [wallets, userId, setWallets, queryClient]);

  const handleWalletDeleted = useCallback((walletId: string) => {
    console.log("🗑️ Wallet deleted:", walletId);
    setWallets(wallets.filter((w) => w.$id !== walletId));
    queryClient.setQueryData(["wallets", userId], (old: Wallet[] | undefined) => {
      return old ? old.filter((w) => w.$id !== walletId) : [];
    });
    queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
    setAnimationTrigger("wallet_deleted");
  }, [wallets, userId, setWallets, queryClient]);

  const handleWalletUpdated = useCallback((wallet: Wallet) => {
    console.log("💾 Wallet updated:", wallet);
    setWallets(wallets.map((w) => (w.$id === wallet.$id ? wallet : w)));
    queryClient.setQueryData(["wallets", userId], (old: Wallet[] | undefined) => {
      return old ? old.map((w) => (w.$id === wallet.$id ? wallet : w)) : [wallet];
    });
    queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
  }, [wallets, userId, setWallets, queryClient]);

  const handleTransactionCreated = useCallback((transaction: Transaction) => {
    console.log("📊 Transaction created:", transaction);
    setTransactions([...(transactions || []), transaction]);
    queryClient.setQueryData(["transactions", userId], (old: Transaction[] | undefined) => {
      return old ? [...old, transaction] : [transaction];
    });
    queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
    setAnimationTrigger("transaction_created");
  }, [transactions, userId, setTransactions, queryClient]);

  const handleTransactionDeleted = useCallback((transactionId: string) => {
    console.log("🗑️ Transaction deleted:", transactionId);
    setTransactions((transactions || []).filter((t) => t.$id !== transactionId));
    queryClient.setQueryData(["transactions", userId], (old: Transaction[] | undefined) => {
      return old ? old.filter((t) => t.$id !== transactionId) : [];
    });
    queryClient.invalidateQueries({ queryKey: ["transactions", userId] });
    setAnimationTrigger("transaction_deleted");
  }, [transactions, userId, setTransactions, queryClient]);

  const connectWebSocket = useCallback(() => {
    if (!userId) {
      console.log("⏭️ Skipping WebSocket connect - no userId");
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("⏭️ WebSocket already connected");
      return;
    }

    console.log("🔌 Attempting WebSocket connection...");

    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setIsConnected(true);

      // Notify server
      ws.send(JSON.stringify({ type: "user_connected", userId }));

      // Check allowance on connect
      setTimeout(() => checkRemainingAllowance(), 500);
    };

    ws.onmessage = (e) => {
      try {
        const data: WSMessage = JSON.parse(e.data);
        console.log("📨 Received:", data.type);

        // Handle allowance response
        if (data.type === "allowance_info" && data.allowance) {
          setRemainingAllowance({
            remaining: data.allowance.remaining,
            limit: data.allowance.limit,
            resetTime: data.allowance.resetTime,
          });
          console.log("📊 Allowance:", data.allowance);
        }

        if (data.type === "wallet_created" && data.wallet) {
          handleWalletCreated(data.wallet);
        }

        if (data.type === "wallet_deleted" && data.walletId) {
          handleWalletDeleted(data.walletId);
        }

        if (data.type === "wallet_updated" && data.wallet) {
          handleWalletUpdated(data.wallet);
          // ✅ Refresh allowance after wallet update
          setTimeout(() => checkRemainingAllowance(), 500);
        }

        if (data.type === "transaction_created" && data.transaction) {
          handleTransactionCreated(data.transaction);
          // Refresh allowance after transaction
          setTimeout(() => checkRemainingAllowance(), 500);
        }

        if (data.type === "transaction_deleted" && data.transactionId) {
          handleTransactionDeleted(data.transactionId);
        }

        if (data.type === "rate_limit_exceeded") {
          console.warn("⚠️ Rate limit exceeded:", data.text);
          setLastMessage(data.text);
        }

        if (data.type === "response" && typeof data.text === "string") {
          setLastMessage(data.text);
          // Refresh allowance after response
          setTimeout(() => checkRemainingAllowance(), 500);
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      console.log("⚠️ WebSocket closed");
      setIsConnected(false);

      console.log("🔄 Reconnecting in 3s...");
      reconnectTimeout.current = setTimeout(() => connectWebSocket(), 3000);
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      ws.close();
    };
  }, [userId, handleWalletCreated, handleWalletDeleted, handleWalletUpdated, handleTransactionCreated, handleTransactionDeleted, checkRemainingAllowance]);

  // Connect on mount
  useEffect(() => {
    if (userId) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [userId, connectWebSocket]);

  return {
    lastMessage,
    sendMessage,
    animationTrigger,
    triggerAnimation,
    clearAnimationTrigger,
    clearLastMessage,
    isConnected,
    remainingAllowance,
    checkRemainingAllowance,
  };
}
