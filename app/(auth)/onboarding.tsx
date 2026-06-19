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
        <Text style={styles.emoji}>🧠</Text>
        <Text style={styles.title}>Real humans. Real expertise.</Text>
        <Text style={styles.body}>
          Talk to lawyers, therapists, coders, designers, and tradesmen — by video or phone. Paid
          time, with verified credentials.
        </Text>
        <Button title="Get started" onPress={() => router.push('/(auth)/login')} fullWidth />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  emoji: { fontSize: 64 },
  title: { ...typography.display, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
