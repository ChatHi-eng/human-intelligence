import { create } from 'zustand';
import type { Customer, Expert, Profile, Role } from '@/types/user';
import {
  getCurrentSession,
  signOutFromSupabase,
  subscribeToAuthChanges,
  supabaseConfigured,
  type Session,
} from '@/services/supabase';

type AuthState = {
  user: Profile | null;
  role: Role | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  signInMock: (role: Role) => void;
  setRole: (role: Role) => void;
  signOut: () => Promise<void>;
};

const mockCustomer: Customer = {
  id: 'cust_self',
  role: 'customer',
  displayName: 'You',
  avatarUrl: null,
  bio: null,
  createdAt: new Date().toISOString(),
};

const mockExpert: Expert = {
  id: 'exp_self',
  role: 'expert',
  displayName: 'You (Expert mode)',
  avatarUrl: null,
  bio: 'Tell customers what you do.',
  industryId: 'coders',
  headline: 'Set your headline',
  hourlyRate: 12000,
  yearsExperience: 5,
  ratingAverage: 0,
  ratingCount: 0,
  credentials: [],
  availability: [],
  verified: false,
  coverImageUrl: '',
  createdAt: new Date().toISOString(),
};

const profileFromSession = (session: Session, role: Role = 'customer'): Profile => {
  const meta = session.user.user_metadata ?? {};
  const displayName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    session.user.email ||
    'You';
  return {
    id: session.user.id,
    role,
    displayName,
    avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
    bio: null,
    createdAt: session.user.created_at,
  };
};

let unsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  isHydrated: false,

  hydrate: async () => {
    if (!supabaseConfigured()) {
      // Dev mode: no Supabase project. Seed mock customer so the app is usable in Expo Go.
      set({ user: mockCustomer, role: 'customer', isHydrated: true });
      return;
    }
    const session = await getCurrentSession();
    set({
      user: session ? profileFromSession(session, get().role ?? 'customer') : null,
      role: session ? (get().role ?? 'customer') : null,
      isHydrated: true,
    });
    unsubscribe?.();
    unsubscribe = subscribeToAuthChanges((next) => {
      set({
        user: next ? profileFromSession(next, get().role ?? 'customer') : null,
        role: next ? (get().role ?? 'customer') : null,
      });
    });
  },

  signInMock: (role) => {
    if (supabaseConfigured()) return; // mock signin only available in dev mode
    set({ user: role === 'expert' ? mockExpert : mockCustomer, role });
  },

  setRole: (role) => {
    const current = get().user;
    if (!current) return;
    if (supabaseConfigured()) {
      set({ role, user: { ...current, role } });
    } else {
      set({ user: role === 'expert' ? mockExpert : mockCustomer, role });
    }
  },

  signOut: async () => {
    await signOutFromSupabase();
    set({ user: null, role: null });
  },
}));
