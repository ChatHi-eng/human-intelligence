import { useQuery } from '@tanstack/react-query';
import { fetchMyExpertBookings } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { computeDailyEarningsSeries, computeEarningsBuckets } from '@/lib/earnings';

export const useEarningsBuckets = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['earnings', 'buckets', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return [];
      const sinceIso = new Date(Date.now() - 31 * 86_400_000).toISOString();
      const bookings = await fetchMyExpertBookings(userId, sinceIso);
      return computeEarningsBuckets(bookings);
    },
    staleTime: 60_000,
  });
};

export const useDailyEarningsSeries = (days = 14) => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['earnings', 'daily-series', userId, days],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return new Array(days).fill(0) as number[];
      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
      const bookings = await fetchMyExpertBookings(userId, sinceIso);
      return computeDailyEarningsSeries(bookings, days);
    },
    staleTime: 60_000,
  });
};

