import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

export default function LoginScreen() {
  const router = useRouter();
  const { signInAsCustomer } = useAuth();
  const [email, setEmail] = useState('');

  const onContinue = () => {
    signInAsCustomer();
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.caption}>
          Use your email — Supabase auth wires up in a follow-up session. For now this just enters
          mock mode.
        </Text>
        <TextInput
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <Button title="Continue" onPress={onContinue} fullWidth />
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
  container: { gap: spacing.md, paddingTop: spacing.xxl },
  title: { ...typography.display, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
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
