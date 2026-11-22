import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capture } from '@/services/analytics';
import { sendTestPush } from '@/services/api';
import { getPushState, registerForPush, turnOffPush, type PushRegistration } from '@/services/push';
import { useAuthStore } from '@/store/authStore';

const PUSH_STATE_KEY = ['push-state'] as const;

// Whether this device gets Palam's notifications, and the switches for it.
export const usePush = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: PUSH_STATE_KEY });

  const { data: state } = useQuery({
    queryKey: PUSH_STATE_KEY,
    queryFn: getPushState,
    staleTime: 0,
  });

  // Must be called from a tap: browsers only ask for permission then.
  const turnOn = useMutation({
    mutationFn: async (): Promise<PushRegistration> => {
      if (!userId) return { registered: false, reason: 'unavailable' };
      return registerForPush(userId);
    },
    onSuccess: (result) => {
      capture('push_turn_on', {
        result: result.registered ? 'on' : result.reason,
      });
      void refresh();
    },
  });

  const turnOff = useMutation({
    mutationFn: turnOffPush,
    onSuccess: () => {
      capture('push_turned_off');
      void refresh();
    },
  });

  const test = useMutation({ mutationFn: sendTestPush });

  return { state, turnOn, turnOff, test };
};
