import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import * as WebBrowser from 'expo-web-browser';
import { SocialSignIn } from '@/components/account/SocialSignIn';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { PRIVACY_URL, TERMS_URL } from '@/constants/links';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { capture } from '@/services/analytics';
import { getCurrentSession } from '@/services/supabase';

type Stage = 'enter-email' | 'enter-code';

export default function LoginScreen() {
  const router = useRouter();
  // Creating an account and signing in are the same step underneath (an
  // emailed code; a new email gets an account). The welcome screen offers
  // both, and this screen words itself to match the one that was chosen.
  const params = useLocalSearchParams<{ mode?: string }>();
  const [creating, setCreating] = useState(params.mode === 'signup');
  const { signInWithMagicLink, verifyEmailOtp, configError } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>('enter-email');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const onSendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Toast.show({ type: 'error', text1: 'Enter your email first' });
      return;
    }
    setSending(true);
    try {
      await signInWithMagicLink(trimmed);
      capture('sign_in_code_requested');
      setCode('');
      setStage('enter-code');
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Could not send code',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSending(false);
    }
  };

  const onVerify = async () => {
    const trimmedCode = code.trim();
    // Supabase OTP length is configurable (6-10 digits), don't hard-require 6.
    if (trimmedCode.length < 6) {
      Toast.show({ type: 'error', text1: 'Enter the code from your email' });
      return;
    }
    setVerifying(true);
    try {
      await verifyEmailOtp(email.trim(), trimmedCode);
      // An OTP sign-in whose account was created moments ago is a brand-new
      // account (email OTP creates the account on first verify).
      const sessionForAnalytics = await getCurrentSession().catch(() => null);
      const createdAtMs = sessionForAnalytics
        ? Date.parse(sessionForAnalytics.user.created_at)
        : Number.NaN;
      capture(
        'sign_in_completed',
        Number.isFinite(createdAtMs)
          ? { new_account: Date.now() - createdAtMs < 5 * 60 * 1000 }
          : undefined,
      );
      Toast.show({ type: 'success', text1: 'Signed in' });
      // Everyone lands on the home screen, new accounts included. Someone
      // without an expert application sees the "Become an expert" card at the
      // top of it and chooses when to start (decided 2026-11-20: an account
      // is not an application, so signing up no longer drops people into
      // step 1 of the form).
      router.replace('/(tabs)');
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Code not accepted',
        text2:
          err instanceof Error
            ? err.message
            : 'Double-check the code, or request a new one.',
      });
    } finally {
      setVerifying(false);
    }
  };

  if (configError) {
    return (
      <Screen>
        <View style={styles.container}>
          <Text style={styles.title}>Setup needed</Text>
          <Text style={styles.caption}>{configError}</Text>
        </View>
      </Screen>
    );
  }

  if (stage === 'enter-code') {
    return (
      <Screen>
        <View style={styles.container}>
          <View style={styles.codeIcon}>
            <Icon name="mail" size={24} color={colors.textPrimary} />
          </View>
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.caption}>
            We emailed a code to <Text style={styles.bold}>{email}</Text>. It may take a minute to
            arrive.
          </Text>
          <TextInput
            placeholder="Enter code"
            placeholderTextColor={colors.textMuted}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
            style={[styles.input, styles.codeInput]}
          />
          <Button
            title={creating ? 'Verify and create account' : 'Verify and sign in'}
            onPress={onVerify}
            loading={verifying}
            fullWidth
          />
          <Button
            title="Resend code"
            variant="ghost"
            onPress={onSendCode}
            loading={sending}
            fullWidth
          />
          <Button
            title="Use a different email"
            variant="ghost"
            onPress={() => setStage('enter-email')}
            fullWidth
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>{creating ? 'Create your account' : 'Sign in'}</Text>
        <Text style={styles.caption}>
          {creating
            ? "Enter your email and we'll send you a code. There is no password to set up."
            : "Enter the email you signed up with and we'll send you a sign-in code."}
        </Text>
        <SocialSignIn />
        <TextInput
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={styles.input}
        />
        <Button title="Send code" onPress={onSendCode} loading={sending} fullWidth />
        <Button
          title={creating ? 'I already have an account' : 'New here? Create an account'}
          variant="ghost"
          onPress={() => setCreating((c) => !c)}
          fullWidth
        />
        <Text style={styles.legal}>
          By continuing you agree to Palam&apos;s{' '}
          <Text
            style={styles.legalLink}
            onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
          >
            Terms
          </Text>{' '}
          and{' '}
          <Text
            style={styles.legalLink}
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
          >
            Privacy Policy
          </Text>
          .
        </Text>
        <Button
          title="Back"
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingTop: spacing.xxl, alignItems: 'stretch' },
  codeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.display, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  legal: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  legalLink: { color: colors.accentInk, textDecorationLine: 'underline' },
  bold: { ...typography.bodyStrong, color: colors.textPrimary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 4,
  },
});
