import { useAuthStore } from '@/store/authStore';
import { signInWithMagicLink, supabaseConfigured, verifyEmailOtp } from '@/services/supabase';

export const useAuth = () => {
  const { user, email, isHydrated, configError, signOut, refreshProfile } = useAuthStore();
  return {
    user,
    email,
    isHydrated,
    configError,
    isSignedIn: Boolean(user),
    isSupabaseConfigured: supabaseConfigured(),
    signInWithMagicLink,
    verifyEmailOtp,
    signOut,
    refreshProfile,
  };
};
