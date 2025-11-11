import { useEffect, useRef, useState, useCallback } from "react";

const WS_PORT = 3000;

export interface Wallet {
  $id: string;
  [key: string]: any;
}

interface WSMessage {
  type: string;
  wallet?: Wallet;
  walletId?: string;
  text?: string;
}

export function useAppSocket(userId: string | null) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [animationTrigger, setAnimationTrigger] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const messageQueue = useRef<any[]>([]);

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

        if (data.wallet) {
          if (data.type === "wallet_created")
            setWallets((w) => [...w, data.wallet!]);
          setAnimationTrigger("wallet_created");
          if (data.type === "wallet_updated")
            setWallets((w) =>
              w.map((x) =>
                x.$id === data.wallet!.$id ? { ...x, ...data.wallet! } : x,
              ),
            );
        }

        if (data.walletId && data.type === "wallet_deleted")
          setWallets((w) => w.filter((x) => x.$id !== data.walletId));

        if (data.text) setLastMessage(data.text);
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
  }, [userId, sendMessage]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connectWebSocket]);

  return {
    wallets,
    lastMessage,
    sendMessage,
    animationTrigger,
    triggerAnimation,
    clearAnimationTrigger,
    isConnected,
  };
}
