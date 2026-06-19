import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

type Stage = 'enter-email' | 'sent';

export default function LoginScreen() {
  const router = useRouter();
  const { isSupabaseConfigured, signInWithMagicLink, signInAsCustomerMock } = useAuth();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('enter-email');
  const [sending, setSending] = useState(false);

  const onContinue = async () => {
    if (!isSupabaseConfigured) {
      signInAsCustomerMock();
      router.replace('/(tabs)');
      return;
    }
    if (!email.trim()) {
      Toast.show({ type: 'error', text1: 'Enter your email first' });
      return;
    }
    setSending(true);
    try {
      await signInWithMagicLink(email.trim());
      setStage('sent');
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Could not send link',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSending(false);
    }
  };

  if (stage === 'sent') {
    return (
      <Screen>
        <View style={styles.container}>
          <Text style={styles.emoji}>📬</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.caption}>
            We sent a sign-in link to <Text style={styles.bold}>{email}</Text>. Tap it on this
            device to come back signed in.
          </Text>
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
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.caption}>
          {isSupabaseConfigured
            ? 'Enter your email and we will send you a one-tap sign-in link.'
            : 'Supabase keys are not set, so this signs you in to a mock customer for UI testing.'}
        </Text>
        {isSupabaseConfigured && (
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
        )}
        <Button
          title={isSupabaseConfigured ? 'Send sign-in link' : 'Continue (mock)'}
          onPress={onContinue}
          loading={sending}
          fullWidth
        />
        <Button
          title="Create an account"
          variant="ghost"
          onPress={() => router.push('/(auth)/signup')}
          fullWidth
        />
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
});
