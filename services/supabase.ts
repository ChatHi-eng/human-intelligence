// Supabase client + auth helpers. UI talks to this module only — never imports
// @supabase/supabase-js directly. When EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are
// empty (dev / Expo Go without a project set up), getSupabase() returns null and
// the authStore falls back to mock mode.
import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// SecureStore is native-only — on web we fall back to localStorage so dev/test
// in a browser still keeps you signed in across reloads.
const SecureStoreAdapter: StorageAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const WebStorageAdapter: StorageAdapter = {
  getItem: async (key) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* no-op */
    }
  },
  removeItem: async (key) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* no-op */
    }
  },
};

const sessionStorage: StorageAdapter =
  Platform.OS === 'web' ? WebStorageAdapter : SecureStoreAdapter;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!url || !anonKey) return null;
  if (!cached) {
    cached = createClient(url, anonKey, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }
  return cached;
};

export const supabaseConfigured = () => Boolean(url && anonKey);

// We hand-build the redirect URL instead of using Linking.createURL because that
// helper returns an IP-based exp:// URL in Expo Go that changes whenever the
// laptop's LAN IP changes — and Supabase is fussy about validating it.
// Stable URLs by environment:
//   - Web: <origin>/auth-callback (works with localhost:8081)
//   - Expo Go on phone: exp+<slug>://auth-callback (registered by Expo Go)
//   - Standalone build: <scheme>://auth-callback (from app.json scheme)
export const authRedirectUrl = (): string => {
  if (Platform.OS === 'web') {
    const origin =
      (globalThis as { location?: { origin?: string } }).location?.origin ??
      'http://localhost:8081';
    return `${origin}/auth-callback`;
  }
  const slug = Constants.expoConfig?.slug;
  const scheme = Constants.expoConfig?.scheme;
  // __DEV__ + slug → Expo Go (uses the exp+slug:// scheme).
  // Otherwise → standalone build (uses the scheme from app.json).
  if (typeof __DEV__ !== 'undefined' && __DEV__ && slug) {
    return `exp+${slug}://auth-callback`;
  }
  if (typeof scheme === 'string' && scheme) {
    return `${scheme}://auth-callback`;
  }
  return 'myapp://auth-callback';
};

export const signInWithMagicLink = async (email: string): Promise<void> => {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
};

export const exchangeCodeForSession = async (code: string): Promise<void> => {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) throw error;
};

export const signOutFromSupabase = async (): Promise<void> => {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
};

export const getCurrentSession = async (): Promise<Session | null> => {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
};

export const subscribeToAuthChanges = (
  cb: (session: Session | null) => void,
): (() => void) => {
  const sb = getSupabase();
  if (!sb) return () => undefined;
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
};

export type { Session };
