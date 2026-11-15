// Push notification registration.
//
// Push only works in a real build on a real phone (not Expo Go, a simulator
// or the web app), so every step is guarded and the function reports why it
// did nothing instead of throwing. The token is stored per device in
// push_tokens; the send-reminders Edge Function reads it from there.
import { Platform } from 'react-native';
import { savePushToken } from '@/services/api';

export type PushRegistration =
  | { registered: true }
  | { registered: false; reason: 'web' | 'simulator' | 'denied' | 'unavailable' };

export const pushSupported = Platform.OS !== 'web';

export const registerForPush = async (userId: string): Promise<PushRegistration> => {
  if (!pushSupported) return { registered: false, reason: 'web' };
  try {
    const [Notifications, Device, Constants] = await Promise.all([
      import('expo-notifications'),
      import('expo-device'),
      import('expo-constants'),
    ]);
    if (!Device.isDevice) return { registered: false, reason: 'simulator' };

    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.status === 'granted' ||
      (await Notifications.requestPermissionsAsync()).status === 'granted';
    if (!granted) return { registered: false, reason: 'denied' };

    const extra = Constants.default.expoConfig?.extra as
      | { eas?: { projectId?: string } }
      | undefined;
    const projectId = extra?.eas?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
    await savePushToken(userId, token, Platform.OS);
    return { registered: true };
  } catch {
    return { registered: false, reason: 'unavailable' };
  }
};
