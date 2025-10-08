import { getUserWallets } from "@/lib/appwrite";
import { Wallet } from "@/types";
import { useEffect, useState } from "react";

export const useFetchData = (userId: string) => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  useEffect(() => {
    const fetchWallets = async () => {
      setLoading(true);
      try {
        const res = await getUserWallets(userId);
        setWallets(res.documents);
      } catch (err) {
        setError("Failed to fetch wallets.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (userId) fetchWallets();
  }, [userId]);

  return { wallets, loading, error };
};
