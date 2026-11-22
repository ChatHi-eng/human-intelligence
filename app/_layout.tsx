import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingView } from '@/components/ui/LoadingView';
import { colors, fonts, spacing, typography } from '@/constants/theme';
import { needsRealName } from '@/lib/names';
import { saveMyTimezone } from '@/services/api';
import { syncPush } from '@/services/push';
import { useAuthStore } from '@/store/authStore';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
    [],
  );
  if (!fontsLoaded) return null;
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
                  contentStyle: { backgroundColor: colors.background },
                  headerStyle: { backgroundColor: colors.background },
                  headerTintColor: colors.textPrimary,
                  headerTitleStyle: {
                    color: colors.textPrimary,
                    fontFamily: fonts.semiBold,
                    fontSize: 16,
                  },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="expert/[id]"
                  options={{ headerShown: false, presentation: 'card' }}
                />
                <Stack.Screen
                  name="booking/[id]"
                  options={{ title: 'Booking', presentation: 'card' }}
                />
                <Stack.Screen
                  name="book/[id]"
                  options={{ title: 'Book a session', presentation: 'modal' }}
                />
                <Stack.Screen name="chat/[id]" options={{ title: 'Chat', presentation: 'card' }} />
                <Stack.Screen
                  name="expert-profile-edit"
                  options={{ title: '', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="expert-onboarding"
                  options={{ title: 'Become an expert', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="profile-edit"
                  options={{ title: '', presentation: 'modal' }}
                />
                <Stack.Screen name="your-name" options={{ headerShown: false }} />
                <Stack.Screen
                  name="delete-account"
                  options={{ title: '', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="studio/calendar"
                  options={{ title: '', presentation: 'card' }}
                />
                <Stack.Screen
                  name="studio/session-settings"
                  options={{ title: '', presentation: 'card' }}
                />
                <Stack.Screen
                  name="studio/availability"
                  options={{ title: '', presentation: 'card' }}
                />
                <Stack.Screen
                  name="studio/earnings"
                  options={{ title: '', presentation: 'card' }}
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
  const email = useAuthStore((s) => s.email);
  const configError = useAuthStore((s) => s.configError);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // On web the page isn't reloaded between accounts, so cached queries from
  // the previous sign-in would survive. Drop everything whenever the
  // signed-in user changes (sign-out, or straight to a different account).
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null | undefined>(undefined);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isHydrated) return;
    if (lastUserId.current !== undefined && lastUserId.current !== userId) {
      queryClient.clear();
    }
    lastUserId.current = userId;
  }, [isHydrated, userId, queryClient]);

  // Once someone is signed in: note the time zone this device is in, so
  // emails and notifications state times the way they read them, and keep a
  // device that already has notifications on registered to this person.
  useEffect(() => {
    if (!isHydrated || !userId) return;
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) void saveMyTimezone(userId, zone).catch(() => undefined);
    } catch {
      /* no zone on this device: emails name the zone they use */
    }
    void syncPush(userId).then(() => queryClient.invalidateQueries({ queryKey: ['push-state'] }));
  }, [isHydrated, userId, queryClient]);

  useEffect(() => {
    if (!isHydrated || configError) return;
    const inAuthGroup = segments[0] === '(auth)';
    const onAuthCallback = segments[0] === 'auth-callback';
    // Expert profiles are publicly shareable (LinkedIn-bio links on the web
    // build) — /expert/[id] renders signed-out; RLS limits anon to approved rows.
    const onPublicExpert = segments[0] === 'expert';
    if (!user && !inAuthGroup && !onAuthCallback && !onPublicExpert) {
      router.replace('/(auth)/welcome');
    } else if (user && needsRealName(user.displayName, email)) {
      // Signed in but still named after their email address: ask once.
      if (segments[0] !== 'your-name') router.replace('/your-name');
    } else if (user && (inAuthGroup || segments[0] === 'your-name')) {
      router.replace('/(tabs)');
    }
  }, [isHydrated, user, email, segments, router, configError]);

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
