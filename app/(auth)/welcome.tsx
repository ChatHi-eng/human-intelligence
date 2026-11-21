import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { PHONE_SESSIONS_ENABLED } from '@/constants/featureFlags';

import { colors, spacing, typography } from '@/constants/theme';

// The front door for anyone who is not signed in. Customers and experts
// launch together (decided 2026-11-21), so this speaks to both: what a
// customer gets first, then the invitation to people who could be experts.
// One account serves both; the expert application starts from a card on the
// home screen, so nothing here is labelled as the application itself.
export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.wordmark}>palam</Text>
        <Text style={styles.title}>Talk to a human who knows.</Text>
        <Text style={styles.body}>
          {PHONE_SESSIONS_ENABLED
            ? 'Every search answers with AI now. Palam is a direct line to people who have lived it: lawyers, therapists, coders, designers, tradesmen. Book a 30-minute video or phone call with one when you need it.'
            : 'Every search answers with AI now. Palam is a direct line to people who have lived it: lawyers, therapists, coders, designers, tradesmen. Book a 30-minute video call with one when you need it.'}
        </Text>
        <Text style={styles.body}>
          If you&apos;re the one people come to for advice, apply as an expert and get paid for
          it.
        </Text>
        <View style={styles.actions}>
          <Button
            title="Create account"
            onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'signup' } })}
            fullWidth
          />
          <Button
            title="Sign in"
            variant="secondary"
            onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'signin' } })}
            fullWidth
          />
          <Text style={styles.note}>
            With one account you can book a session or apply as an expert.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  wordmark: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 44,
    letterSpacing: -1,
    color: colors.accent,
  },
  title: { ...typography.display, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
