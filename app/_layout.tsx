import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingView } from '@/components/ui/LoadingView';
import { useAuthStore } from '@/store/authStore';

export default function RootLayout() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
    [],
  );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <StatusBar style="dark" />
            <AuthGate>
              <Stack
                screenOptions={{
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: '#FFFFFF' },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(expert)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="expert/[id]"
                  options={{ title: 'Expert', presentation: 'card' }}
                />
                <Stack.Screen
                  name="booking/[id]"
                  options={{ title: 'Booking', presentation: 'card' }}
                />
                <Stack.Screen
                  name="auth-callback"
                  options={{ headerShown: false, animation: 'none' }}
                />
              </Stack>
            </AuthGate>
            <Toast />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    const onAuthCallback = segments[0] === 'auth-callback';
    if (!user && !inAuthGroup && !onAuthCallback) {
      router.replace('/(auth)/onboarding');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isHydrated, user, segments, router]);

  if (!isHydrated) return <LoadingView label="Loading…" />;
  return <>{children}</>;
}
