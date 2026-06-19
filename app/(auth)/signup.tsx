import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

export default function SignupScreen() {
  const router = useRouter();
  const { signInAsCustomer, signInAsExpert } = useAuth();

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>How will you use Human Intelligence?</Text>
        <Text style={styles.caption}>
          You can switch later from your profile. The expert path will include credentials, rate,
          and availability.
        </Text>
        <Button
          title="I'm here to find an expert"
          onPress={() => {
            signInAsCustomer();
            router.replace('/(tabs)');
          }}
          fullWidth
        />
        <Button
          title="I want to offer expertise"
          variant="secondary"
          onPress={() => {
            signInAsExpert();
            router.replace('/(expert)/dashboard');
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
