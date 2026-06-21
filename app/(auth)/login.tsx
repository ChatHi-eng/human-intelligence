import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { authRedirectUrl } from '@/services/supabase';
import { useAuth } from '@/hooks/useAuth';

type Stage = 'enter-email' | 'sent';

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithMagicLink, configError } = useAuth();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('enter-email');
  const [sending, setSending] = useState(false);

  const onSendLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Toast.show({ type: 'error', text1: 'Enter your email first' });
      return;
    }
    setSending(true);
    try {
      await signInWithMagicLink(trimmed);
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
          <View style={styles.debugBox}>
            <Text style={styles.debugLabel}>Debug — redirect URL sent to Supabase:</Text>
            <Text selectable style={styles.debugUrl}>
              {authRedirectUrl()}
            </Text>
            <Text style={styles.debugHint}>
              If sign-in fails, paste this URL exactly into Supabase → Authentication → URL
              Configuration → Redirect URLs.
            </Text>
          </View>
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
          Enter your email and we&apos;ll send you a one-tap sign-in link. New here? Tapping the
          link signs you in and creates your account at the same time.
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
        <Button title="Send sign-in link" onPress={onSendLink} loading={sending} fullWidth />
        <Button
          title="Back"
          variant="ghost"
          onPress={() => router.back()}
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
  debugBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  debugLabel: { ...typography.label, color: colors.textSecondary },
  debugUrl: { ...typography.bodyStrong, color: colors.textPrimary },
  debugHint: { ...typography.caption, color: colors.textMuted },
});
