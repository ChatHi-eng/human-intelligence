import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useDeleteAccount } from '@/hooks/useAccount';
import { useAuth } from '@/hooks/useAuth';

// Confirmation lives in this screen itself, no browser confirm()/Alert, so
// the flow is identical on web and native: read what happens, type DELETE,
// press the red button.
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { mutate: deleteAccount, isPending, error } = useDeleteAccount();
  const [confirmText, setConfirmText] = useState('');

  const armed = confirmText.trim().toUpperCase() === 'DELETE';

  const onDelete = () => {
    if (!armed || isPending) return;
    deleteAccount(undefined, {
      onSuccess: async () => {
        await signOut();
        router.replace('/(auth)/onboarding');
      },
    });
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionHeader title="Delete your account" caption="This is permanent. There is no undo." />

        <Text style={styles.body}>
          Deleting your account permanently removes your profile, expert application, bookings,
          reviews, and messages. Once it&apos;s gone, it&apos;s gone.
        </Text>
        <Text style={styles.body}>
          Got an upcoming or active booking? Cancel it first. We won&apos;t delete an account
          someone is still counting on.
        </Text>
        <Text style={styles.body}>
          If you set up payouts, your Stripe account stays yours and isn&apos;t touched. Only its
          link to Palam goes away.
        </Text>

        <Text style={styles.label}>Type DELETE to confirm</Text>
        <TextInput
          placeholder="DELETE"
          placeholderTextColor={colors.textMuted}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          maxLength={20}
        />

        {error ? <Text style={styles.error}>{error.message}</Text> : null}

        <Button
          title="Delete my account"
          variant="danger"
          onPress={onDelete}
          disabled={!armed}
          loading={isPending}
          fullWidth
          style={{ marginTop: spacing.lg }}
        />
        <Button title="Never mind" variant="ghost" onPress={() => router.back()} fullWidth />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  body: { ...typography.body, color: colors.textSecondary },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
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
  error: { ...typography.caption, color: colors.danger },
});
