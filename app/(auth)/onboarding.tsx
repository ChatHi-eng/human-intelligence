import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing, typography } from '@/constants/theme';

export default function OnboardingScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.wordmark}>palam</Text>
        <Text style={styles.title}>Talk to a human who knows.</Text>
        <Text style={styles.body}>
          Real people — lawyers, therapists, coders, designers, tradesmen — on a video or phone
          call, when you need them.
        </Text>
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
