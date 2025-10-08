import { useEffect, useRef, useState } from "react";

export function useAppSocket(userId: string | null) {
  const [wallets, setWallets] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!userId) return;

    const connect = () => {
      const socket = new WebSocket("ws://172.20.10.5:3000");

      socket.onopen = () => {
        console.log("🔗 WS connected");
        socket.send(JSON.stringify({ type: "user_connected", userId }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "wallet_created":
              setWallets((prev) => [...prev, data.wallet]);
              break;

            case "wallet_updated":
              setWallets((prev) =>
                prev.map((w) => (w.$id === data.wallet.$id ? data.wallet : w))
              );
              break;

            case "wallet_deleted":
              setWallets((prev) => prev.filter((w) => w.$id !== data.walletId));
              break;

            case "response":
              console.log("💬 AI Advisor:", data.text);
              break;

            case "error":
              console.warn("WS Server Error:", data.text);
              break;

            default:
              console.log("WS unknown message:", data);
          }
        } catch (err) {
          console.error("❌ WS parse error:", err);
        }
      };

      socket.onclose = () => {
        console.log("❌ WS disconnected, retrying in 3s...");
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error("❌ WS error:", err);
        socket.close();
      };

      wsRef.current = socket;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [userId]);

  const sendMessage = (data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn("WS not connected yet");
    }
  };

  return { wallets, sendMessage };
}
