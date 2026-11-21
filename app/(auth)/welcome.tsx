import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { CUSTOMER_BOOKING_ENABLED, PHONE_SESSIONS_ENABLED } from '@/constants/featureFlags';

import { colors, spacing, typography } from '@/constants/theme';

// The front door for anyone who is not signed in: what Palam is, then the two
// things a visitor can do here, create an account or sign in. The expert
// application comes after the account exists (a card at the top of the home
// screen starts it), so nothing on this screen is labelled as the application.
export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.wordmark}>palam</Text>
        {/* Supply-first launch: sell becoming an expert until customer booking
            opens; the customer pitch returns when the flag flips. */}
        {CUSTOMER_BOOKING_ENABLED ? (
          <>
            <Text style={styles.title}>Talk to a human who knows.</Text>
            <Text style={styles.body}>
              {PHONE_SESSIONS_ENABLED
                ? 'Every search answers with AI now. Palam is a direct line to people who have lived it: lawyers, therapists, coders, designers, tradesmen. Book a video or phone call with one when you need it.'
                : 'Every search answers with AI now. Palam is a direct line to people who have lived it: lawyers, therapists, coders, designers, tradesmen. Book a video call with one when you need it.'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Get paid for what you know.</Text>
            <Text style={styles.body}>
              The internet answers everything with AI now, compiled from other people&apos;s work.
              Palam pays the people who did that work. You set your rate and take 30-minute video
              sessions. Apply now and you&apos;ll be first in line when booking opens.
            </Text>
          </>
        )}
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
          {!CUSTOMER_BOOKING_ENABLED && (
            <Text style={styles.note}>
              Create your account first. You can apply as an expert from your home screen.
            </Text>
          )}
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
