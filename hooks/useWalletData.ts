import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useGlobalContext } from "@/lib/global-provider";
import { useWalletStore } from "@/lib/walletStore";
import { getUserWallets } from "@/lib/appwrite";

export const useWalletData = () => {
  const { user } = useGlobalContext();
  const { wallets, setWallets } = useWalletStore();

  const query = useQuery({
    queryKey: ["wallets", user?.$id],
    queryFn: async () => {
      if (!user?.$id) throw new Error("No user ID");
      console.log("🔍 Fetching wallets for:", user.$id); // ADD THIS
      try {
        const res = await getUserWallets(user.$id);
        console.log("💰 Wallets result:", res.documents.length); // ADD THIS

        return res.documents;
      } catch (err) {
        console.log("❌ Wallet fetch error:", err);
        throw err;
      }
    },
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 5,
    retry: 2
  });

  useEffect(() => {
    if (query.data) {
      setWallets(query.data);
    }
  }, [query.data, setWallets]);

  return {
    ...query,
    wallets,
    totalBalance: wallets.reduce((acc, w) => acc + (w.amount || 0), 0)
  };
};
