import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAvailabilityDate,
  addCredential,
  deleteAvailabilityDate,
  deleteCredential,
  deleteMyExpertProfile,
  fetchExpert,
  fetchExperts,
  requestExpert,
  setAvailability,
  updateMyExpertSettings,
  upsertMyExpertProfile,
  type BackgroundEntryInput,
  type ExpertProfileInput,
  type ExpertsFilters,
} from '@/services/api';
import { capture } from '@/services/analytics';
import {
  createConnectOnboardingLink,
  openConnectOnboarding,
  syncConnectStatus,
} from '@/services/stripe';
import { deviceTimeZone } from '@/lib/slots';
import { useAuthStore } from '@/store/authStore';
import type { AvailabilityKind, AvailabilityWindow } from '@/types/user';

export type { ExpertsFilters };

export const useExperts = (filters: ExpertsFilters = {}) =>
  useQuery({
    queryKey: ['experts', filters],
    queryFn: () => fetchExperts(filters),
    staleTime: 60_000,
    // Keep showing the current list while a changed filter loads, so the
    // screen (and the search box in its header) never blanks out.
    placeholderData: (previous) => previous,
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

export const useRequestExpert = () =>
  useMutation({
    mutationFn: (input: { need: string; searched?: string }) => requestExpert(input),
    onSuccess: () => capture('expert_request_sent'),
  });

export const useUpdateExpertSettings = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      paused?: boolean;
      bufferMinutes?: number;
      autoAccept?: boolean;
      introEnabled?: boolean;
      introWeeklyLimit?: number;
    }) => {
      if (!userId) throw new Error('Not signed in');
      await updateMyExpertSettings(userId, settings);
    },
    onSuccess: (_data, settings) => {
      capture('expert_settings_changed', settings);
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
    mutationFn: async (input: {
      date: string;
      startMinute: number;
      endMinute: number;
      blocked?: boolean;
    }) => {
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

export const useStartConnectOnboarding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      capture('payout_onboarding_started');
      const link = await createConnectOnboardingLink();
      const result = await openConnectOnboarding(link.onboardingUrl);
      // Actively sync when the user returns — doesn't wait for Stripe's
      // account.updated webhook (which requires the correct webhook scope).
      const status = await syncConnectStatus().catch(() => null);
      return { ...link, result: result.type, status };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      void qc.invalidateQueries({ queryKey: ['experts'] });
    },
  });
};

export const useSyncConnectStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncConnectStatus(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      void qc.invalidateQueries({ queryKey: ['experts'] });
    },
  });
};

export const useSetAvailability = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { windows: AvailabilityWindow[]; kind: AvailabilityKind }) => {
      if (!userId) throw new Error('Not signed in');
      // The hours are typed in the expert's own clock, so record which zone
      // that is every time they save.
      await setAvailability(userId, input.windows, deviceTimeZone(), input.kind);
    },
    onSuccess: (_data, input) => {
      capture('availability_saved', { window_count: input.windows.length, kind: input.kind });
      void qc.invalidateQueries({ queryKey: ['my-expert-profile'] });
      void qc.invalidateQueries({ queryKey: ['experts'] });
      if (userId) void qc.invalidateQueries({ queryKey: ['expert', userId] });
    },
  });
};
