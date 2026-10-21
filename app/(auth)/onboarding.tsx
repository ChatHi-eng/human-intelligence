import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { CUSTOMER_BOOKING_ENABLED, PHONE_SESSIONS_ENABLED } from '@/constants/featureFlags';
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
                ? 'Real people — lawyers, therapists, coders, designers, tradesmen — on a video or phone call, when you need them.'
                : 'Real people — lawyers, therapists, coders, designers, tradesmen — on a video call, when you need them.'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Get paid for what you know.</Text>
            <Text style={styles.body}>
              Palam is where real people — lawyers, therapists, coders, designers, tradesmen — earn
              for 30-minute video sessions. Join as a founding expert, set your own rate, and be
              first in line when booking opens.
            </Text>
          </>
        )}
        <Button title="Get started" onPress={() => router.push('/(auth)/login')} fullWidth />
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
