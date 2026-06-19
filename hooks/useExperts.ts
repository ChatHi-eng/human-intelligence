import { useQuery } from '@tanstack/react-query';
import { mockExperts } from '@/lib/mockData';
import type { Expert } from '@/types/user';

const delay = <T,>(value: T, ms = 350) =>
  new Promise<T>((r) => setTimeout(() => r(value), ms));

export type ExpertsFilters = {
  industryId?: string;
  minRating?: number;
  maxHourlyRate?: number;
  query?: string;
};

const matches = (e: Expert, f: ExpertsFilters): boolean => {
  if (f.industryId && e.industryId !== f.industryId) return false;
  if (typeof f.minRating === 'number' && e.ratingAverage < f.minRating) return false;
  if (typeof f.maxHourlyRate === 'number' && e.hourlyRate > f.maxHourlyRate) return false;
  if (f.query) {
    const q = f.query.toLowerCase();
    const hay = `${e.displayName} ${e.headline} ${e.bio ?? ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
};

export const useExperts = (filters: ExpertsFilters = {}) =>
  useQuery({
    queryKey: ['experts', filters],
    queryFn: () => delay(mockExperts.filter((e) => matches(e, filters))),
    staleTime: 60_000,
  });

export const useExpert = (id: string | undefined) =>
  useQuery({
    queryKey: ['expert', id],
    enabled: Boolean(id),
    queryFn: () => delay(mockExperts.find((e) => e.id === id) ?? null),
  });
