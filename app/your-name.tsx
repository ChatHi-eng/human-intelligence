import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateMyProfile } from '@/hooks/useProfile';
import { fullName } from '@/lib/names';

// Asked once, right after an account is created (and once for older accounts
// that never gave one): the person's real name. An expert sees it on every
// booking, and a customer sees it on an expert's profile, so an email handle
// will not do. The sign-in gate in app/_layout.tsx sends people here.
export default function YourNameScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { mutate: update, isPending } = useUpdateMyProfile();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onContinue = () => {
    if (!first.trim() || !last.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    setError(null);
    update(
      { displayName: fullName(first, last) },
      {
        onSuccess: () => router.replace('/(tabs)'),
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not save your name',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>What&apos;s your name?</Text>
        <Text style={styles.caption}>
          The person you book sees your name, so they know who they&apos;re meeting.
        </Text>

        <Text style={styles.label}>First name</Text>
        <TextInput
          value={first}
          onChangeText={(v) => {
            setFirst(v);
            setError(null);
          }}
          autoComplete="given-name"
          autoCapitalize="words"
          autoFocus
          accessibilityLabel="First name"
          style={styles.input}
          maxLength={40}
          returnKeyType="next"
        />
        <Text style={styles.label}>Last name</Text>
        <TextInput
          value={last}
          onChangeText={(v) => {
            setLast(v);
            setError(null);
          }}
          autoComplete="family-name"
          autoCapitalize="words"
          accessibilityLabel="Last name"
          style={styles.input}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={onContinue}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Continue"
          onPress={onContinue}
          loading={isPending}
          fullWidth
          style={{ marginTop: spacing.lg }}
        />
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} fullWidth />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingTop: spacing.xxxl,
    gap: spacing.sm,
  },
  title: { ...typography.display, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { ...typography.caption, color: colors.danger },
});
