import React, { createContext, useContext } from "react";
import { useAppSocket } from "@/hooks/useAppSocket";
import { useGlobalContext } from "@/lib/global-provider";

type SocketContextType = ReturnType<typeof useAppSocket>;

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useGlobalContext();
  const socket = useAppSocket(user?.$id ?? null);
  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocket(): SocketContextType {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside <SocketProvider>");
  return ctx;
}
