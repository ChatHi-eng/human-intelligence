// Notifications on the device: booking requests, confirmations and session
// reminders.
//
// Two paths, one table. In a browser this is Web Push: a small service worker
// (public/sw.js) receives the message and the browser's push subscription is
// stored in push_tokens. In the phone app it is Expo's push service and the
// row holds an Expo token. The server (supabase/functions/_shared/notify.ts)
// sends to whatever rows a person has.
//
// Nothing here throws. Every function reports why it did nothing instead.
import { Platform } from 'react-native';
import {
  deletePushToken,
  fetchPushPublicKey,
  savePushSubscription,
  savePushToken,
} from '@/services/api';

// on            this device gets notifications
// off           it could, and has not been switched on
// blocked       the person said no in the browser or phone settings
// needs-install an iPhone or iPad browser tab: notifications only work once
//               Palam is added to the Home Screen and opened from there
// unsupported   this browser cannot do it at all
export type PushState = 'on' | 'off' | 'blocked' | 'needs-install' | 'unsupported';

export type PushRegistration =
  | { registered: true }
  | {
      registered: false;
      reason: 'needs-install' | 'unsupported' | 'simulator' | 'denied' | 'unavailable';
    };

const isWeb = Platform.OS === 'web';

// Someone who turned notifications off on this device should not have them
// quietly come back the next time the app loads.
const OFF_KEY = 'palam.push.off';
const readOff = () => {
  try {
    return globalThis.localStorage?.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
};
const writeOff = (off: boolean) => {
  try {
    if (off) globalThis.localStorage?.setItem(OFF_KEY, '1');
    else globalThis.localStorage?.removeItem(OFF_KEY);
  } catch {
    /* private mode: nothing to remember */
  }
};

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

type WebNav = Navigator & { standalone?: boolean };

const webCapable = () =>
  typeof navigator !== 'undefined' &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

const isAppleMobile = () => {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

const isInstalled = () => {
  if (typeof window === 'undefined') return false;
  return (
    (navigator as WebNav).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
};

const keyBytes = (base64url: string): Uint8Array<ArrayBuffer> => {
  const padded =
    base64url.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const sameKey = (current: ArrayBuffer | null | undefined, wanted: Uint8Array) => {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === wanted.length && bytes.every((b, i) => b === wanted[i]);
};

const webRegistration = async (): Promise<ServiceWorkerRegistration> => {
  const existing = await navigator.serviceWorker.getRegistration('/');
  const registration = existing ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  return registration;
};

const webState = async (): Promise<PushState> => {
  if (!webCapable()) return isAppleMobile() && !isInstalled() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted' || readOff()) return 'off';
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? 'on' : 'off';
  } catch {
    return 'off';
  }
};

// Subscribes this browser and stores the subscription against the signed-in
// person. `ask` decides whether the permission question may be shown: it must
// only ever be shown in answer to a tap.
const webRegister = async (userId: string, ask: boolean): Promise<PushRegistration> => {
  if (!webCapable()) {
    return {
      registered: false,
      reason: isAppleMobile() && !isInstalled() ? 'needs-install' : 'unsupported',
    };
  }
  try {
    if (Notification.permission === 'denied') return { registered: false, reason: 'denied' };
    if (Notification.permission !== 'granted') {
      if (!ask) return { registered: false, reason: 'unavailable' };
      if ((await Notification.requestPermission()) !== 'granted') {
        return { registered: false, reason: 'denied' };
      }
    }
    const registration = await webRegistration();
    const wanted = keyBytes(await fetchPushPublicKey());
    const subscribe = () =>
      registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });

    let subscription = await registration.pushManager.getSubscription();
    // A subscription made for a different server key cannot be used.
    if (subscription && !sameKey(subscription.options.applicationServerKey, wanted)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await subscribe();

    const save = async (sub: PushSubscription) => {
      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!json.endpoint || !p256dh || !auth) throw new Error('Incomplete subscription');
      await savePushSubscription(userId, { endpoint: json.endpoint, p256dh, auth });
    };
    try {
      await save(subscription);
    } catch {
      // This browser's subscription is still filed under whoever used it
      // last. Start a fresh one so their notifications cannot land here.
      await subscription.unsubscribe();
      subscription = await subscribe();
      await save(subscription);
    }
    writeOff(false);
    return { registered: true };
  } catch {
    return { registered: false, reason: 'unavailable' };
  }
};

const webUnregister = async (): Promise<void> => {
  if (!webCapable()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await deletePushToken(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    /* nothing to undo */
  }
};

// ---------------------------------------------------------------------------
// Phone app
// ---------------------------------------------------------------------------

const nativeState = async (): Promise<PushState> => {
  try {
    const [Notifications, Device] = await Promise.all([
      import('expo-notifications'),
      import('expo-device'),
    ]);
    if (!Device.isDevice) return 'unsupported';
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status === 'granted') return readOff() ? 'off' : 'on';
    return permission.canAskAgain === false ? 'blocked' : 'off';
  } catch {
    return 'unsupported';
  }
};

const nativeRegister = async (userId: string): Promise<PushRegistration> => {
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
    writeOff(false);
    return { registered: true };
  } catch {
    return { registered: false, reason: 'unavailable' };
  }
};

// ---------------------------------------------------------------------------
// What the rest of the app uses
// ---------------------------------------------------------------------------

export const getPushState = (): Promise<PushState> => (isWeb ? webState() : nativeState());

// Turn notifications on for this device. Call it from a tap: a browser will
// only show its permission question in answer to one.
export const registerForPush = (userId: string): Promise<PushRegistration> =>
  isWeb ? webRegister(userId, true) : nativeRegister(userId);

// Quietly keeps this device's registration current: after signing in, or when
// the app loads. In a browser it never asks; it only re-registers a device
// that already said yes. In the phone app it asks the first time, which is
// allowed there after a booking.
export const syncPush = async (userId: string): Promise<void> => {
  if (readOff()) return;
  if (isWeb) {
    if (!webCapable() || Notification.permission !== 'granted') return;
    await webRegister(userId, false);
    return;
  }
  await nativeRegister(userId);
};

// Turn notifications off for this device and remember the choice.
export const turnOffPush = async (): Promise<void> => {
  writeOff(true);
  if (isWeb) await webUnregister();
};

// On sign-out. Call while still signed in, so the row can be removed and the
// next person to use this device does not get this person's notifications.
export const forgetPushDevice = async (): Promise<void> => {
  if (isWeb) {
    await webUnregister();
    return;
  }
  try {
    const [Notifications, Constants] = await Promise.all([
      import('expo-notifications'),
      import('expo-constants'),
    ]);
    if ((await Notifications.getPermissionsAsync()).status !== 'granted') return;
    const extra = Constants.default.expoConfig?.extra as
      | { eas?: { projectId?: string } }
      | undefined;
    const projectId = extra?.eas?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
    await deletePushToken(token);
  } catch {
    /* nothing registered on this phone */
  }
};
