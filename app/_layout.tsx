import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingView } from '@/components/ui/LoadingView';
import { colors, spacing, typography } from '@/constants/theme';
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
                <Stack.Screen
                  name="expert/[id]"
                  options={{ title: 'Expert', presentation: 'card' }}
                />
                <Stack.Screen
                  name="booking/[id]"
                  options={{ title: 'Booking', presentation: 'card' }}
                />
                <Stack.Screen
                  name="book/[id]"
                  options={{ title: 'Book a session', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="expert-profile-edit"
                  options={{ title: 'Expert profile', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="expert-onboarding"
                  options={{ title: 'Become an expert', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="profile-edit"
                  options={{ title: 'Edit account', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="studio/calendar"
                  options={{ title: 'Calendar', presentation: 'card' }}
                />
                <Stack.Screen
                  name="studio/earnings"
                  options={{ title: 'Earnings', presentation: 'card' }}
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
  const configError = useAuthStore((s) => s.configError);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated || configError) return;
    const inAuthGroup = segments[0] === '(auth)';
    const onAuthCallback = segments[0] === 'auth-callback';
    if (!user && !inAuthGroup && !onAuthCallback) {
      router.replace('/(auth)/onboarding');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isHydrated, user, segments, router, configError]);

  if (!isHydrated) return <LoadingView label="Loading…" />;
  if (configError) return <ConfigErrorScreen message={configError} />;
  return <>{children}</>;
}

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorEmoji}>🔧</Text>
      <Text style={styles.errorTitle}>Setup needed</Text>
      <Text style={styles.errorBody}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  errorBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
