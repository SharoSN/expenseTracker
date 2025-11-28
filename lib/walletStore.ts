import { create } from "zustand";
import { QueryClient } from "@tanstack/react-query";

// Define the state structure
interface WalletState {
  wallets: any[];
  transactions: any[];
  socket: WebSocket | null;
  setWallets: (wallets: any[]) => void;
  setTransactions: (transactions: any[]) => void;
  initializeWebSocket: (userId: string, queryClient: QueryClient) => void;
  closeWebSocket: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  // Initial state
  wallets: [],
  transactions: [],
  socket: null,

  // Actions
  setWallets: (wallets) => set({ wallets }),
  setTransactions: (transactions) => set({ transactions }),

  closeWebSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null });
      console.log("❌ Global WS disconnected");
    }
  },

  initializeWebSocket: (userId, queryClient) => {
    // Prevent multiple connections
    if (get().socket) {
      return;
    }

    const newSocket = new WebSocket("ws://localhost:3000");
    set({ socket: newSocket });

    newSocket.onopen = () => {
      console.log("✅ Global WS connected");
      newSocket.send(JSON.stringify({ type: "user_connected", userId }));
    };

    newSocket.onclose = () => {
      console.log("❌ Global WS disconnected (will try to reconnect on next focus)");
      // Nullify the socket so it can be re-initialized
      set({ socket: null });
    };

    newSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Głopbal WS message:", data);

      // When a change happens on the server, we don't need to manually
      // update the state here. Instead, we tell React Query to invalidate its
      // cache for the relevant queries. React Query will then automatically
      // refetch the data, and the `onSuccess` handlers of our `useQuery` hooks
      // will update the Zustand store. This keeps the data flow consistent.

      switch (data.type) {
        case "wallet_created":
        case "wallet_deleted":
        case "wallet_updated":
          // Invalidate both wallets and transactions as a wallet update can affect both
          queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
          queryClient.invalidateQueries({ queryKey: ["transactions", userId] });
          break;

        case "transaction_created":
        case "transaction_deleted":
        case "transaction_updated":
          // Invalidate both transactions and wallets as a transaction update affects wallet balances
          queryClient.invalidateQueries({ queryKey: ["transactions", userId] });
          queryClient.invalidateQueries({ queryKey: ["wallets", userId] });
          break;
      }
    };

    newSocket.onerror = (error) => {
      console.error("❌ Global WS Error:", error);
    };
  },
}));
