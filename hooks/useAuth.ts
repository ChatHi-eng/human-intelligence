import { useAuthStore } from '@/store/authStore';
import { signInWithMagicLink, supabaseConfigured, verifyEmailOtp } from '@/services/supabase';

export const useAuth = () => {
  const { user, isHydrated, configError, signOut, refreshProfile } = useAuthStore();
  return {
    user,
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
