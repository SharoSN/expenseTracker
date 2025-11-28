import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useGlobalContext } from '@/lib/global-provider';
import { useWalletStore } from '@/lib/walletStore';
import { getUserWallets } from '@/lib/appwrite';

export const useWalletData = () => {
  const { user } = useGlobalContext();
  const { wallets, setWallets } = useWalletStore();

  const query = useQuery({
    queryKey: ['wallets', user?.$id],
    queryFn: async () => {
      if (!user?.$id) throw new Error('No user ID');
      const res = await getUserWallets(user.$id);
      return res.documents;
    },
    enabled: !!user?.$id,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  useEffect(() => {
    if (query.data) {
      setWallets(query.data);
    }
  }, [query.data, setWallets]);

  return {
    ...query,
    wallets,
    totalBalance: wallets.reduce((acc, w) => acc + (w.amount || 0), 0),
  };
};
