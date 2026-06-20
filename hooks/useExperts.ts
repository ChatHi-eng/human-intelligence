import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAvailabilityDate,
  addCredential,
  deleteAvailabilityDate,
  deleteCredential,
  deleteMyExpertProfile,
  fetchExpert,
  fetchExperts,
  setAvailability,
  upsertMyExpertProfile,
  type BackgroundEntryInput,
  type ExpertProfileInput,
  type ExpertsFilters,
} from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import type { AvailabilityWindow } from '@/types/user';

export type { ExpertsFilters };

export const useExperts = (filters: ExpertsFilters = {}) =>
  useQuery({
    queryKey: ['experts', filters],
    queryFn: () => fetchExperts(filters),
    staleTime: 60_000,
  });

export const useExpert = (id: string | undefined) =>
  useQuery({
    queryKey: ['expert', id],
    enabled: Boolean(id),
    queryFn: () => (id ? fetchExpert(id) : Promise.resolve(null)),
  });

export const useMyExpertProfile = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['my-expert-profile', userId],
    enabled: Boolean(userId),
    queryFn: () => (userId ? fetchExpert(userId) : Promise.resolve(null)),
  });
};

export const useUpsertMyExpertProfile = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExpertProfileInput) => {
      if (!userId) throw new Error('Not signed in');
      await upsertMyExpertProfile(userId, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      void qc.invalidateQueries({ queryKey: ['experts'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
    },
  });
};

export const useDeleteMyExpertProfile = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not signed in');
      await deleteMyExpertProfile(userId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      void qc.invalidateQueries({ queryKey: ['experts'] });
    },
  });
};

export const useAddCredential = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: BackgroundEntryInput) => {
      if (!userId) throw new Error('Not signed in');
      await addCredential(userId, c);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
    },
  });
};

export const useAddAvailabilityDate = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date: string; startMinute: number; endMinute: number }) => {
      if (!userId) throw new Error('Not signed in');
      await addAvailabilityDate(userId, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
    },
  });
};

export const useDeleteAvailabilityDate = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAvailabilityDate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
    },
  });
};

export const useDeleteCredential = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
    },
  });
};

export const useSetAvailability = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (windows: AvailabilityWindow[]) => {
      if (!userId) throw new Error('Not signed in');
      await setAvailability(userId, windows);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
    },
  });
};
