import { create } from 'zustand';
import type { Customer, Expert, Profile, Role } from '@/types/user';

type AuthState = {
  user: Profile | null;
  role: Role | null;
  isHydrated: boolean;
  signInMock: (role: Role) => void;
  signOut: () => void;
  setUser: (user: Profile | null) => void;
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

export const useAuthStore = create<AuthState>((set) => ({
  user: mockCustomer,
  role: 'customer',
  isHydrated: true,
  signInMock: (role) =>
    set({ user: role === 'expert' ? mockExpert : mockCustomer, role }),
  signOut: () => set({ user: null, role: null }),
  setUser: (user) => set({ user, role: user?.role ?? null }),
}));
