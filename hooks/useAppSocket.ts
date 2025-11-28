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

interface WSMessage {
  type: string;
  wallet?: Wallet;
  walletId?: string;
  transaction?: Transaction;
  text?: string;
}

export function useAppSocket(userId: string | null) {
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [animationTrigger, setAnimationTrigger] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const messageQueue = useRef<any[]>([]);

  // Get React Query client & Zustand store
  const queryClient = useQueryClient();
  const { setWallets, setTransactions, wallets, transactions } = useWalletStore();

  // --- Send message with queue support ---
  const sendMessage = useCallback(
    (data: any) => {
      if (!userId) {
        console.warn("sendMessage skipped: no userId yet", data);
        return;
      }
      const payload = { ...data, userId };
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      } else {
        messageQueue.current.push(payload); // queue if not connected
      }
    },
    [userId],
  );

  const triggerAnimation = useCallback(
    (name: string) => setAnimationTrigger(name),
    [],
  );

  const clearAnimationTrigger = useCallback(
    () => setAnimationTrigger(null),
    [],
  );

  const clearLastMessage = useCallback(() => {
    setLastMessage(null);
  }, []);

  // --- Sync WebSocket updates to React Query & Zustand ---
  const handleWalletCreated = useCallback((wallet: Wallet) => {
    console.log("💰 Wallet created via WebSocket:", wallet);

    // Update Zustand store
    setWallets([...wallets, wallet]);

    // Update React Query cache
    queryClient.setQueryData(["wallets", userId], (old: Wallet[] | undefined) => {
      return old ? [...old, wallet] : [wallet];
    });

    // Invalidate to sync with backend
    queryClient.invalidateQueries({ queryKey: ["wallets", userId] });

    setAnimationTrigger("wallet_created");
  }, [wallets, userId, setWallets, queryClient]);

  const handleWalletDeleted = useCallback((walletId: string) => {
    console.log("🗑️ Wallet deleted via WebSocket:", walletId);

    // Update Zustand store
    setWallets(wallets.filter((w) => w.$id !== walletId));

    // Update React Query cache
    queryClient.setQueryData(["wallets", userId], (old: Wallet[] | undefined) => {
      return old ? old.filter((w) => w.$id !== walletId) : [];
    });

    // Invalidate to sync with backend
    queryClient.invalidateQueries({ queryKey: ["wallets", userId] });

    setAnimationTrigger("wallet_deleted");
  }, [wallets, userId, setWallets, queryClient]);

  const handleTransactionCreated = useCallback((transaction: Transaction) => {
    console.log("📊 Transaction created via WebSocket:", transaction);

    // Update Zustand store
    setTransactions([...(transactions || []), transaction]);

    // Update React Query cache
    queryClient.setQueryData(["transactions", userId], (old: Transaction[] | undefined) => {
      return old ? [...old, transaction] : [transaction];
    });

    // Invalidate wallet totals since amount changed
    queryClient.invalidateQueries({ queryKey: ["wallets", userId] });

    setAnimationTrigger("transaction_created");
  }, [transactions, userId, setTransactions, queryClient]);

  const connectWebSocket = useCallback(() => {
    if (!userId) return;

    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setIsConnected(true);

      // Send queued messages
      messageQueue.current.forEach((msg) => ws.send(JSON.stringify(msg)));
      messageQueue.current = [];

      // Notify server
      sendMessage({ type: "user_connected" });
    };

    ws.onmessage = (e) => {
      try {
        const data: WSMessage = JSON.parse(e.data);
        console.log("Received WS:", data);

        // Handle wallet creation
        if (data.type === "wallet_created" && data.wallet) {
          handleWalletCreated(data.wallet);
        }

        // Handle wallet deletion
        if (data.type === "wallet_deleted" && data.walletId) {
          handleWalletDeleted(data.walletId);
        }

        // Handle transaction creation
        if (data.type === "transaction_created" && data.transaction) {
          handleTransactionCreated(data.transaction);
        }

        // Handle response text

        if (data.type === "response" && typeof data.text === "string") {
          setLastMessage(data.text);
        }

      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      console.log("⚠️ WebSocket disconnected, retrying in 3s");
      setIsConnected(false);
      reconnectTimeout.current = setTimeout(() => connectWebSocket(), 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };
  }, [userId, sendMessage, handleWalletCreated, handleWalletDeleted, handleTransactionCreated]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connectWebSocket]);

  return {
    lastMessage,
    sendMessage,
    animationTrigger,
    triggerAnimation,
    clearAnimationTrigger,
    clearLastMessage,
    isConnected,
  };
}
