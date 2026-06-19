import { useQuery } from '@tanstack/react-query';
import { mockDailyEarningsCents, mockEarnings } from '@/lib/mockData';

const delay = <T,>(value: T, ms = 250) =>
  new Promise<T>((r) => setTimeout(() => r(value), ms));

export const useEarningsBuckets = () =>
  useQuery({
    queryKey: ['earnings', 'buckets'],
    queryFn: () => delay(mockEarnings),
    staleTime: 60_000,
  });

export const useDailyEarningsSeries = () =>
  useQuery({
    queryKey: ['earnings', 'daily-series'],
    queryFn: () => delay(mockDailyEarningsCents),
    staleTime: 60_000,
  });
