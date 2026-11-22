import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { capture } from '@/services/analytics';
import {
  fetchEnabledOAuthProviders,
  signInWithProvider,
  type OAuthProvider,
} from '@/services/supabase';

// Google's own "G" mark, as their sign-in guidelines ask for.
const GOOGLE_G = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
)}`;

const LABEL: Record<OAuthProvider, string> = {
  google: 'Continue with Google',
  apple: 'Continue with Apple',
};

// One-tap sign-in, shown above the email field. It renders nothing until the
// owner has switched a provider on in Supabase, and nothing in the phone app
// yet (that needs a native sign-in sheet), so it can ship ahead of both.
export const SocialSignIn = () => {
  const { data: providers = [] } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: fetchEnabledOAuthProviders,
    staleTime: 10 * 60_000,
    enabled: Platform.OS === 'web',
  });
  const [opening, setOpening] = useState<OAuthProvider | null>(null);

  if (Platform.OS !== 'web' || providers.length === 0) return null;

  const start = (provider: OAuthProvider) => {
    setOpening(provider);
    capture('sign_in_provider_chosen', { provider });
    signInWithProvider(provider).catch((err: unknown) => {
      setOpening(null);
      Toast.show({
        type: 'error',
        text1: 'Could not open sign-in',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    });
  };

  return (
    <View style={styles.wrap}>
      {providers.map((provider) => (
        <Pressable
          key={provider}
          onPress={() => start(provider)}
          disabled={opening !== null}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            provider === 'apple' && styles.apple,
            pressed && styles.pressed,
            opening !== null && opening !== provider && styles.dimmed,
          ]}
        >
          {provider === 'google' ? (
            <Image source={{ uri: GOOGLE_G }} style={styles.mark} contentFit="contain" />
          ) : null}
          <Text style={[styles.label, provider === 'apple' && styles.appleLabel]}>
            {opening === provider ? 'Opening…' : LABEL[provider]}
          </Text>
        </Pressable>
      ))}
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text style={styles.or}>or use your email</Text>
        <View style={styles.rule} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  button: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    backgroundColor: colors.background,
  },
  apple: { backgroundColor: colors.textPrimary },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.4 },
  mark: { width: 18, height: 18 },
  label: { ...typography.bodyStrong, color: colors.textPrimary },
  appleLabel: { color: '#FFFFFF' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { ...typography.caption, color: colors.textMuted },
});
