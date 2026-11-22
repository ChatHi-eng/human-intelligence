import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkPhoneCode,
  fetchAppConfig,
  fetchMyNotificationPrefs,
  saveMyNotificationPrefs,
  sendPhoneCode,
  type NotificationPrefs,
} from '@/services/api';
import { capture } from '@/services/analytics';
import { useAuthStore } from '@/store/authStore';

export const useNotificationPrefs = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['notification-prefs', userId],
    enabled: Boolean(userId),
    queryFn: () => (userId ? fetchMyNotificationPrefs(userId) : Promise.resolve(null)),
  });
};

export const useSaveNotificationPrefs = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: NotificationPrefs) => {
      if (!userId) throw new Error('Not signed in');
      await saveMyNotificationPrefs(userId, prefs);
    },
    onSuccess: (_data, prefs) => {
      capture('reminder_settings_saved', {
        email: prefs.emailReminders,
        sms: prefs.smsReminders,
      });
      void qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
};

// The owner's switches (is a verified mobile number needed to book?).
export const useAppConfig = () =>
  useQuery({
    queryKey: ['app-config'],
    queryFn: fetchAppConfig,
    staleTime: 5 * 60_000,
  });

// Texting a code to a number, then checking the code the person typed. A
// successful check saves the number as verified on the server.
export const useSendPhoneCode = () =>
  useMutation({
    mutationFn: (phone: string) => sendPhoneCode(phone),
    onSuccess: () => capture('phone_code_sent'),
  });

export const useCheckPhoneCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) => checkPhoneCode(phone, code),
    onSuccess: () => {
      capture('phone_verified');
      void qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
};
