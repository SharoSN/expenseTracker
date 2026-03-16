import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWalletStore } from "@/lib/walletStore";

const WS_URL = "ws://172.20.10.5:3000";
const RECONNECT_BASE_DELAY = 3000;
const RECONNECT_MAX_DELAY = 30000;

export interface BudgetAlert {
  severity: "warning" | "exceeded";
  label: string;
  category: string | null;
  spent: number;
  limit: number;
  overBy?: number;
  remaining?: number;
  pct: number;
}

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

export interface EnrichedTransaction {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string | null;
  walletName: string;
  formattedAmount: string;
}

export interface BudgetItem {
  id: string;
  category: string | null;
  label: string;
  limit: number;
  spent: number;
  pct: number;
  remaining: number;
}

export interface Visualization {
  type: string;
  chartType?: "bar" | "line";
  data?: any[];
  title?: string;
  xAxis?: string;
  yAxis?: string;
  series?: Array<{ name: string; color: string; key: string }>;
  transactions?: EnrichedTransaction[];
  charts?: any[];
  anomalies?: any[];
  insights?: any[];
  budgets?: BudgetItem[];
}

export interface TransactionCandidate {
  id: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  walletName: string;
  formattedAmount: string;
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
  awaitingWallet?: boolean;
  wallets?: Array<{ id: string; name: string; amount: number }>;
  transactions?: TransactionCandidate[];
  alerts?: BudgetAlert[];
}

export function useAppSocket(userId: string | null) {
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const budgetAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearBudgetAlerts = useCallback(() => setBudgetAlerts([]), []);

  const triggerBudgetAlerts = useCallback((alerts: BudgetAlert[]) => {
    if (budgetAlertTimerRef.current) clearTimeout(budgetAlertTimerRef.current);
    setBudgetAlerts([]);
    budgetAlertTimerRef.current = setTimeout(() => {
      setBudgetAlerts(alerts);
    }, 50);
  }, []);

  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastVisualization, setLastVisualization] =
    useState<Visualization | null>(null);
  const [animationTrigger, setAnimationTrigger] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [remainingAllowance, setRemainingAllowance] =
    useState<Allowance | null>(null);
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const [walletSelection, setWalletSelection] = useState<Array<{
    id: string;
    name: string;
    amount: number;
  }> | null>(null);
  const [transactionSelection, setTransactionSelection] = useState<
    TransactionCandidate[] | null
  >(null);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const allowanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_DELAY);
  const isIntentionalCloseRef = useRef(false);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const queryClient = useQueryClient();

  // ── Use refs for store data to avoid recreating callbacks ─────────────────
  // This is the key fix — wallets/transactions in deps caused connectWebSocket
  // to recreate on every update, triggering the reconnect loop
  const { setWallets, setTransactions } = useWalletStore();
  const walletsRef = useRef(useWalletStore.getState().wallets);
  const transactionsRef = useRef(useWalletStore.getState().transactions);

  useEffect(() => {
    return useWalletStore.subscribe((state) => {
      walletsRef.current = state.wallets;
      transactionsRef.current = state.transactions;
    });
  }, []);

  const scheduleAllowanceCheck = useCallback((ws: WebSocket, uid: string) => {
    if (allowanceTimeoutRef.current) clearTimeout(allowanceTimeoutRef.current);
    allowanceTimeoutRef.current = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "check_allowance", userId: uid }));
        console.log("📊 Checking remaining allowance...");
      }
    }, 2000);
  }, []);

  const sendMessage = useCallback((data: any) => {
    const uid = userIdRef.current;
    if (!uid) {
      console.warn("no userId");
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn(
        "❌ sendMessage DROPPED — socket state:",
        wsRef.current?.readyState
      );
      return;
    }
    const payload = { ...data, userId: uid };
    wsRef.current.send(JSON.stringify(payload));
    console.log("📤 Sent:", data.type, "| socket:", wsRef.current.readyState);
  }, []);

  const checkRemainingAllowance = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({ type: "check_allowance", userId: uid })
    );
  }, []);

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

  // ── All handlers use refs — stable, never recreated ───────────────────────
  const handleWalletCreated = useCallback(
    (wallet: Wallet) => {
      console.log("💰 Wallet created:", wallet);
      const current = walletsRef.current || [];
      setWallets([...current, wallet]);
      queryClient.setQueryData(
        ["wallets", userIdRef.current],
        (old: Wallet[] | undefined) => (old ? [...old, wallet] : [wallet])
      );
      queryClient.invalidateQueries({
        queryKey: ["wallets", userIdRef.current]
      });
      setAnimationTrigger("wallet_created");
    },
    [setWallets, queryClient]
  );

  const handleWalletDeleted = useCallback(
    (walletId: string) => {
      console.log("🗑️ Wallet deleted:", walletId);
      const current = walletsRef.current || [];
      setWallets(current.filter((w) => w.$id !== walletId));
      queryClient.setQueryData(
        ["wallets", userIdRef.current],
        (old: Wallet[] | undefined) =>
          old ? old.filter((w) => w.$id !== walletId) : []
      );
      queryClient.invalidateQueries({
        queryKey: ["wallets", userIdRef.current]
      });
      setAnimationTrigger("wallet_deleted");
    },
    [setWallets, queryClient]
  );

  const handleWalletUpdated = useCallback(
    (wallet: Wallet, ws: WebSocket) => {
      console.log("💾 Wallet updated:", wallet);
      const current = walletsRef.current || [];
      setWallets(current.map((w) => (w.$id === wallet.$id ? wallet : w)));
      queryClient.setQueryData(
        ["wallets", userIdRef.current],
        (old: Wallet[] | undefined) =>
          old ? old.map((w) => (w.$id === wallet.$id ? wallet : w)) : [wallet]
      );
      queryClient.invalidateQueries({
        queryKey: ["wallets", userIdRef.current]
      });
      scheduleAllowanceCheck(ws, userIdRef.current!);
    },
    [setWallets, queryClient, scheduleAllowanceCheck]
  );

  const handleTransactionCreated = useCallback(
    (transaction: Transaction, ws: WebSocket) => {
      console.log("📊 Transaction created:", transaction);
      const current = transactionsRef.current || [];
      setTransactions([...current, transaction]);
      queryClient.setQueryData(
        ["transactions", userIdRef.current],
        (old: Transaction[] | undefined) =>
          old ? [...old, transaction] : [transaction]
      );
      queryClient.invalidateQueries({
        queryKey: ["wallets", userIdRef.current]
      });
      setAnimationTrigger("transaction_created");
      scheduleAllowanceCheck(ws, userIdRef.current!);
    },
    [setTransactions, queryClient, scheduleAllowanceCheck]
  );

  const handleTransactionDeleted = useCallback(
    (transactionId: string) => {
      console.log("🗑️ Transaction deleted:", transactionId);
      const current = transactionsRef.current || [];
      setTransactions(current.filter((t) => t.$id !== transactionId));
      queryClient.setQueryData(
        ["transactions", userIdRef.current],
        (old: Transaction[] | undefined) =>
          old ? old.filter((t) => t.$id !== transactionId) : []
      );
      queryClient.invalidateQueries({
        queryKey: ["transactions", userIdRef.current]
      });
      setAnimationTrigger("transaction_deleted");
    },
    [setTransactions, queryClient]
  );

  const connectWebSocket = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) {
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
      reconnectDelayRef.current = RECONNECT_BASE_DELAY;
      setIsConnected(true);
      setAwaitingWallet(false);
      ws.send(JSON.stringify({ type: "user_connected", userId: uid }));
      scheduleAllowanceCheck(ws, uid);
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
        }

        if (data.type === "budget_alert") {
          console.log("🚨 Budget alert received:", data.alerts?.length);
          triggerBudgetAlerts(data.alerts ?? []);
        }

        if (data.type === "wallet_created" && data.wallet)
          handleWalletCreated(data.wallet);
        if (data.type === "wallet_deleted" && data.walletId)
          handleWalletDeleted(data.walletId);
        if (data.type === "wallet_updated" && data.wallet)
          handleWalletUpdated(data.wallet, ws);
        if (data.type === "transaction_created" && data.transaction)
          handleTransactionCreated(data.transaction, ws);
        if (data.type === "transaction_deleted" && data.transactionId)
          handleTransactionDeleted(data.transactionId);

        if (data.type === "rate_limit_exceeded") {
          console.warn("⚠️ Rate limit exceeded:", data.text);
          setPaywallVisible(true);
          setLastMessage(data.text ?? null);
          setLastVisualization(null);
          setAwaitingWallet(false);
        }

        if (data.type === "response" && typeof data.text === "string") {
          console.log("📨 Response:", {
            text: data.text.substring(0, 50) + "...",
            awaitingWallet: !!data.awaitingWallet
          });
          setLastMessage(data.text);
          setLastVisualization(data.visualization ?? null);
          setAwaitingWallet(data.awaitingWallet === true);
          setTransactionSelection(null);
          scheduleAllowanceCheck(ws, uid);
        }

        if (data.type === "wallet_selection") {
          setWalletSelection(data.wallets ?? null);
          setAwaitingWallet(true);
        }

        if (data.type === "transaction_selection") {
          console.log(
            "🔀 Transaction selection needed:",
            data.transactions?.length,
            "candidates"
          );
          setTransactionSelection(data.transactions ?? null);
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      console.log("⚠️ WebSocket closed");
      setIsConnected(false);
      if (isIntentionalCloseRef.current) {
        console.log("🛑 Intentional close — not reconnecting");
        return;
      }
      const delay = Math.min(reconnectDelayRef.current, RECONNECT_MAX_DELAY);
      reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_DELAY);
      console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
      reconnectTimeoutRef.current = setTimeout(() => connectWebSocket(), delay);
    };

    ws.onerror = (err) => {
      console.log("❌ WebSocket error:", err);
      ws.close();
    };
  }, [
    // ✅ Only stable refs/callbacks — no wallets/transactions state
    scheduleAllowanceCheck,
    triggerBudgetAlerts,
    handleWalletCreated,
    handleWalletDeleted,
    handleWalletUpdated,
    handleTransactionCreated,
    handleTransactionDeleted
  ]);

  useEffect(() => {
    if (userId) connectWebSocket();
    return () => {
      isIntentionalCloseRef.current = true;
      if (allowanceTimeoutRef.current)
        clearTimeout(allowanceTimeoutRef.current);
      if (reconnectTimeoutRef.current)
        clearTimeout(reconnectTimeoutRef.current);
      if (budgetAlertTimerRef.current)
        clearTimeout(budgetAlertTimerRef.current);
      if (wsRef.current) wsRef.current.close();
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
    checkRemainingAllowance,
    awaitingWallet,
    walletSelection,
    setWalletSelection,
    transactionSelection,
    setTransactionSelection,
    paywallVisible,
    setPaywallVisible,
    budgetAlerts,
    clearBudgetAlerts
  };
}
