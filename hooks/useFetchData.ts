import { getUserWallets } from "@/lib/appwrite";
import { Wallet } from "@/types";
import { useEffect, useState, useCallback } from "react";

export const useFetchData = (userId: string) => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const fetchWallets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await getUserWallets(userId);
      setWallets(res.documents);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch wallets.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch on mount / userId change
  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  return { wallets, loading, error, refetch: fetchWallets };
};
