import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

export default function SignupScreen() {
  const router = useRouter();
  const { isSupabaseConfigured, signInAsCustomerMock, signInAsExpertMock } = useAuth();

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>How will you use Human Intelligence?</Text>
        <Text style={styles.caption}>
          {isSupabaseConfigured
            ? 'You can switch later from your profile. Picking a role takes you to the sign-in screen.'
            : 'Supabase keys are not set — these buttons sign you in to a mock account for UI testing.'}
        </Text>
        <Button
          title="I'm here to find an expert"
          onPress={() => {
            if (isSupabaseConfigured) {
              router.push('/(auth)/login');
            } else {
              signInAsCustomerMock();
              router.replace('/(tabs)');
            }
          }}
          fullWidth
        />
        <Button
          title="I want to offer expertise"
          variant="secondary"
          onPress={() => {
            if (isSupabaseConfigured) {
              router.push('/(auth)/login');
            } else {
              signInAsExpertMock();
              router.replace('/(expert)/dashboard');
            }
          }}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingTop: spacing.xxl },
  title: { ...typography.display, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
});
