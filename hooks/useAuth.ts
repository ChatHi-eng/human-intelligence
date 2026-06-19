import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { user, role, signInMock, signOut } = useAuthStore();
  return {
    user,
    role,
    isSignedIn: Boolean(user),
    signInAsCustomer: () => signInMock('customer'),
    signInAsExpert: () => signInMock('expert'),
    signOut,
  };
};
