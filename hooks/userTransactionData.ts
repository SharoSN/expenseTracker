import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useGlobalContext } from '@/lib/global-provider';
import { useWalletStore } from '@/lib/walletStore';
import { getUserTransactions } from '@/lib/appwrite';

export const useTransactionData = () => {
  const { user } = useGlobalContext();
  const { setTransactions } = useWalletStore();

  const query = useQuery({
    queryKey: ['transactions', user?.$id],
    queryFn: async () => {
      if (!user?.$id) throw new Error('No user ID');
      const transactions = await getUserTransactions(user.$id);
      return transactions; // Already returns array
    },
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 2,
  });

  // Sync query data to Zustand store
  useEffect(() => {
    if (query.data) {
      setTransactions(query.data);
    }
  }, [query.data, setTransactions]);

  return {
    ...query,
    transactions: query.data || [],
  };
};
