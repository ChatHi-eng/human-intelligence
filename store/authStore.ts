import { create } from 'zustand';
import type { Profile } from '@/types/user';
import {
  getCurrentSession,
  signOutFromSupabase,
  subscribeToAuthChanges,
  supabaseConfigured,
  type Session,
} from '@/services/supabase';
import { fetchMyProfile } from '@/services/api';

type AuthState = {
  user: Profile | null;
  isHydrated: boolean;
  configError: string | null;
  hydrate: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

let unsubscribe: (() => void) | null = null;

const loadUserFromSession = async (session: Session | null): Promise<Profile | null> => {
  if (!session) return null;
  try {
    const profile = await fetchMyProfile(session.user.id);
    if (profile) return profile;
  } catch {
    // fall through to synth profile — likely a transient network issue
  }
  // The handle_new_user trigger normally seeds this row, but synth a fallback so the
  // user can still proceed in the rare case it hasn't materialized yet.
  return {
    id: session.user.id,
    role: 'customer',
    displayName: session.user.email ?? 'You',
    avatarUrl: null,
    bio: null,
    createdAt: session.user.created_at,
  };
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isHydrated: false,
  configError: null,

  hydrate: async () => {
    if (!supabaseConfigured()) {
      set({
        isHydrated: true,
        configError:
          'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env and restart with `npx expo start --clear`.',
      });
      return;
    }
    try {
      const session = await getCurrentSession();
      const user = await loadUserFromSession(session);
      set({ user, isHydrated: true, configError: null });
      unsubscribe?.();
      unsubscribe = subscribeToAuthChanges(async (next) => {
        const refreshed = await loadUserFromSession(next);
        set({ user: refreshed });
      });
    } catch (err) {
      set({
        isHydrated: true,
        configError: err instanceof Error ? err.message : 'Failed to connect to Supabase',
      });
    }
  },

  signOut: async () => {
    await signOutFromSupabase();
    set({ user: null });
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;
    const profile = await fetchMyProfile(userId);
    if (profile) set({ user: profile });
  },
}));
