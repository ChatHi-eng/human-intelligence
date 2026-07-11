import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

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
    if (trimmedCode.length !== 6) {
      Toast.show({ type: 'error', text1: 'Enter the 6-digit code from your email' });
      return;
    }
    setVerifying(true);
    try {
      await verifyEmailOtp(email.trim(), trimmedCode);
      Toast.show({ type: 'success', text1: 'Signed in' });
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
          <Text style={styles.emoji}>📬</Text>
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.caption}>
            We emailed a 6-digit code to <Text style={styles.bold}>{email}</Text>. It may take a
            minute to arrive.
          </Text>
          <TextInput
            placeholder="123456"
            placeholderTextColor={colors.textMuted}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
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
          Enter your email and we&apos;ll send you a 6-digit sign-in code. New here? The code signs
          you in and creates your account at the same time.
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
    letterSpacing: 8,
  },
});
