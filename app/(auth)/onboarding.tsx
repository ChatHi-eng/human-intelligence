import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { CUSTOMER_BOOKING_ENABLED, PHONE_SESSIONS_ENABLED } from '@/constants/featureFlags';
import { EXPERT_KEEP_PCT } from '@/constants/business';
import { colors, spacing, typography } from '@/constants/theme';

export default function OnboardingScreen() {
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
              Palam pays the people who did that work. You set your rate, take 30-minute video
              sessions, and keep {EXPERT_KEEP_PCT}% of each one. Apply now and you&apos;ll be first in
              line when booking opens.
            </Text>
          </>
        )}
        <Button
          title={CUSTOMER_BOOKING_ENABLED ? 'Get started' : 'Start your application'}
          onPress={() => router.push('/(auth)/login')} fullWidth />
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
});
