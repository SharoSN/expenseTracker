// hooks/useAppSocket.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "@/lib/walletStore";

const WS_URL = "ws://172.20.10.5:3000";
const RECONNECT_BASE_DELAY = 3000;
const RECONNECT_MAX_DELAY = 30000;

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

export interface Allowance {
  remaining: number;
  limit: number;
  resetTime: string;
}

export interface Visualization {
  type: string;
  chartType: "bar" | "line";
  data: any[];
  title: string;
  xAxis: string;
  yAxis: string;
  series: Array<{
    name: string;
    color: string;
    key: string;
  }>;
}

interface WSMessage {
  type: string;
  wallet?: Wallet;
  walletId?: string;
  transactionId?: string;
  transaction?: Transaction;
  allowance?: Allowance;
  text?: string;
  visualization?: Visualization;
}

export function useAppSocket(userId: string | null) {
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastVisualization, setLastVisualization] =
    useState<Visualization | null>(null);
  const [animationTrigger, setAnimationTrigger] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [remainingAllowance, setRemainingAllowance] =
    useState<Allowance | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const allowanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_DELAY);
  // Flag to suppress reconnect when we intentionally close (e.g. on unmount)
  const isIntentionalCloseRef = useRef(false);

  const queryClient = useQueryClient();
  const { setWallets, setTransactions, wallets, transactions } =
    useWalletStore();

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const scheduleAllowanceCheck = useCallback(
    (ws: WebSocket, userId: string) => {
      if (allowanceTimeoutRef.current) {
        clearTimeout(allowanceTimeoutRef.current);
      }
      allowanceTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "check_allowance", userId }));
          console.log("📊 Checking remaining allowance...");
        }
      }, 500);
    },
    []
  );

  // ─── Public API ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (data: any) => {
      if (!userId) {
        console.warn("sendMessage skipped: no userId yet", data);
        return;
      }
      // FIX: operator precedence bug — was `!wsRef.current?.readyState === WebSocket.OPEN`
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn("Cannot send message: WebSocket not connected");
        return;
      }
      const payload = { ...data, userId };
      wsRef.current.send(JSON.stringify(payload));
      console.log("📤 Message sent:", data.type);
    },
    [userId]
  );

  const checkRemainingAllowance = useCallback(() => {
    if (!userId) return;
    // FIX: read readyState directly from the ref instead of relying on potentially stale `isConnected` state
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot check allowance: WebSocket not ready");
      return;
    }
    wsRef.current.send(JSON.stringify({ type: "check_allowance", userId }));
    console.log("📊 Checking remaining allowance...");
  }, [userId]);

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
    setLastVisualization(null);
  }, []);

  // ─── Wallet / Transaction handlers ──────────────────────────────────────────

  const handleWalletCreated = useCallback(
    (wallet: Wallet) => {
      console.log("💰 Wallet created:", wallet);
      setWallets([...wallets, wallet]);
      queryClient.setQueryData(
        ["wallets", userId],
        (old: Wallet[] | undefined) => (old ? [...old, wallet] : [wallet])
      );
      queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
      setAnimationTrigger("wallet_created");
    },
    [wallets, userId, setWallets, queryClient]
  );

  const handleWalletDeleted = useCallback(
    (walletId: string) => {
      console.log("🗑️ Wallet deleted:", walletId);
      setWallets(wallets.filter((w) => w.$id !== walletId));
      queryClient.setQueryData(
        ["wallets", userId],
        (old: Wallet[] | undefined) =>
          old ? old.filter((w) => w.$id !== walletId) : []
      );
      queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
      setAnimationTrigger("wallet_deleted");
    },
    [wallets, userId, setWallets, queryClient]
  );

  const handleWalletUpdated = useCallback(
    (wallet: Wallet, ws: WebSocket) => {
      console.log("💾 Wallet updated:", wallet);
      setWallets(wallets.map((w) => (w.$id === wallet.$id ? wallet : w)));
      queryClient.setQueryData(
        ["wallets", userId],
        (old: Wallet[] | undefined) =>
          old ? old.map((w) => (w.$id === wallet.$id ? wallet : w)) : [wallet]
      );
      queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
      scheduleAllowanceCheck(ws, userId!);
    },
    [wallets, userId, setWallets, queryClient, scheduleAllowanceCheck]
  );

  const handleTransactionCreated = useCallback(
    (transaction: Transaction, ws: WebSocket) => {
      console.log("📊 Transaction created:", transaction);
      setTransactions([...(transactions || []), transaction]);
      queryClient.setQueryData(
        ["transactions", userId],
        (old: Transaction[] | undefined) =>
          old ? [...old, transaction] : [transaction]
      );
      queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
      setAnimationTrigger("transaction_created");
      scheduleAllowanceCheck(ws, userId!);
    },
    [transactions, userId, setTransactions, queryClient, scheduleAllowanceCheck]
  );

  const handleTransactionDeleted = useCallback(
    (transactionId: string) => {
      console.log("🗑️ Transaction deleted:", transactionId);
      setTransactions(
        (transactions || []).filter((t) => t.$id !== transactionId)
      );
      queryClient.setQueryData(
        ["transactions", userId],
        (old: Transaction[] | undefined) =>
          old ? old.filter((t) => t.$id !== transactionId) : []
      );
      queryClient.invalidateQueries({ queryKey: ["transactions", userId] });
      setAnimationTrigger("transaction_deleted");
    },
    [transactions, userId, setTransactions, queryClient]
  );

  // ─── WebSocket connection ────────────────────────────────────────────────────

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
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    isIntentionalCloseRef.current = false;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      // Reset backoff on successful connection
      reconnectDelayRef.current = RECONNECT_BASE_DELAY;
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "user_connected", userId }));
      scheduleAllowanceCheck(ws, userId);
    };

    ws.onmessage = (e) => {
      try {
        const data: WSMessage = JSON.parse(e.data);
        console.log("📨 Received:", data.type);

        if (data.type === "allowance_info" && data.allowance) {
          setRemainingAllowance({
            remaining: data.allowance.remaining,
            limit: data.allowance.limit,
            resetTime: data.allowance.resetTime
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
          handleWalletUpdated(data.wallet, ws);
        }

        if (data.type === "transaction_created" && data.transaction) {
          handleTransactionCreated(data.transaction, ws);
        }

        if (data.type === "transaction_deleted" && data.transactionId) {
          handleTransactionDeleted(data.transactionId);
        }

        if (data.type === "rate_limit_exceeded") {
          console.warn("⚠️ Rate limit exceeded:", data.text);
          setLastMessage(data.text ?? null);
          setLastVisualization(null);
        }

        if (data.type === "response" && typeof data.text === "string") {
          console.log("📨 Response received:", {
            text: data.text.substring(0, 50) + "...",
            hasVisualization: !!data.visualization
          });
          setLastMessage(data.text);
          setLastVisualization(data.visualization ?? null);
          scheduleAllowanceCheck(ws, userId);
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      console.log("⚠️ WebSocket closed");
      setIsConnected(false);

      // FIX: do NOT reconnect when we closed intentionally (component unmount)
      if (isIntentionalCloseRef.current) {
        console.log("🛑 Intentional close — not reconnecting");
        return;
      }

      // FIX: exponential backoff with a cap
      const delay = Math.min(reconnectDelayRef.current, RECONNECT_MAX_DELAY);
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_DELAY);
      console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
      reconnectTimeoutRef.current = setTimeout(() => connectWebSocket(), delay);
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      ws.close();
    };
  }, [
    userId,
    scheduleAllowanceCheck,
    handleWalletCreated,
    handleWalletDeleted,
    handleWalletUpdated,
    handleTransactionCreated,
    handleTransactionDeleted
  ]);

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (userId) {
      connectWebSocket();
    }

    return () => {
      // FIX: mark as intentional so onclose doesn't reschedule a reconnect
      isIntentionalCloseRef.current = true;

      if (allowanceTimeoutRef.current) {
        clearTimeout(allowanceTimeoutRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId, connectWebSocket]);

  return {
    lastMessage,
    lastVisualization,
    sendMessage,
    animationTrigger,
    triggerAnimation,
    clearAnimationTrigger,
    clearLastMessage,
    isConnected,
    remainingAllowance,
    checkRemainingAllowance
  };
}
