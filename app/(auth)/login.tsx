import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import * as WebBrowser from 'expo-web-browser';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { CUSTOMER_BOOKING_ENABLED } from '@/constants/featureFlags';
import { PRIVACY_URL, TERMS_URL } from '@/constants/links';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { capture } from '@/services/analytics';
import { fetchExpert } from '@/services/api';
import { getCurrentSession } from '@/services/supabase';

type Stage = 'enter-email' | 'enter-code';

export default function LoginScreen() {
  const router = useRouter();
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
    // Supabase OTP length is configurable (6-10 digits) — don't hard-require 6.
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
      router.replace('/(tabs)');
      // Supply-first launch: a sign-in with no expert application yet is almost
      // certainly a prospective expert — walk them straight into the
      // application. Tabs stay beneath it, so Cancel lands on Discover.
      if (!CUSTOMER_BOOKING_ENABLED) {
        try {
          const session = await getCurrentSession();
          if (session && !(await fetchExpert(session.user.id))) {
            router.push('/expert-onboarding');
          }
        } catch {
          // The nudge is best-effort — never block sign-in on it.
        }
      }
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
          <Text style={styles.emoji}>📬</Text>
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.caption}>
            We emailed a sign-in code to <Text style={styles.bold}>{email}</Text>. It may take a
            minute to arrive.
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
          <Button title="Verify and sign in" onPress={onVerify} loading={verifying} fullWidth />
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
        <Text style={styles.title}>Sign in or create account</Text>
        <Text style={styles.caption}>
          Enter your email and we&apos;ll send you a sign-in code. New here? The code signs you in
          and creates your account at the same time.
        </Text>
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
        <Button title="Back" variant="ghost" onPress={() => router.back()} fullWidth />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingTop: spacing.xxl, alignItems: 'stretch' },
  emoji: { fontSize: 48, alignSelf: 'center' },
  title: { ...typography.display, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  legal: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  legalLink: { color: colors.accent, textDecorationLine: 'underline' },
  bold: { ...typography.bodyStrong, color: colors.textPrimary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 4,
  },
});
