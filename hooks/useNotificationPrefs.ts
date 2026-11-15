import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMyNotificationPrefs,
  saveMyNotificationPrefs,
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
