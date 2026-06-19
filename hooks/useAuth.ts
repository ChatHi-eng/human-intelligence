import { useAuthStore } from '@/store/authStore';
import { signInWithMagicLink, supabaseConfigured } from '@/services/supabase';

export const useAuth = () => {
  const { user, role, isHydrated, signInMock, setRole, signOut } = useAuthStore();
  return {
    user,
    role,
    isHydrated,
    isSignedIn: Boolean(user),
    isSupabaseConfigured: supabaseConfigured(),
    signInWithMagicLink,
    signInAsCustomerMock: () => signInMock('customer'),
    signInAsExpertMock: () => signInMock('expert'),
    switchToCustomer: () => setRole('customer'),
    switchToExpert: () => setRole('expert'),
    signOut,
  };
};
