import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useRequestExpert } from '@/hooks/useExperts';

export type RequestExpertProps = {
  /** What the customer had typed or picked when nothing matched. */
  searched?: string;
};

// Shown when a search finds nobody. With few experts at launch that will
// happen often, so the dead end becomes a request a person answers.
export const RequestExpert = ({ searched }: RequestExpertProps) => {
  const [need, setNeed] = useState('');
  const [sent, setSent] = useState(false);
  const { mutate: send, isPending } = useRequestExpert();

  if (sent) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Got it</Text>
        <Text style={styles.body}>
          A person on our team reads every request and will reply by email, usually within a
          couple of days.
        </Text>
      </View>
    );
  }

  const onSend = () => {
    if (need.trim().length < 10) {
      Toast.show({ type: 'error', text1: 'Tell us a little more about what you need' });
      return;
    }
    send(
      { need: need.trim(), searched },
      {
        onSuccess: () => setSent(true),
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not send',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>No one matches yet. Tell us what you need</Text>
      <Text style={styles.body}>
        Palam is new and adding experts every week. Describe what you want help with and a person
        on our team will look for the right expert and reply to you by email.
      </Text>
      <TextInput
        placeholder="e.g. I'm selling a small business and want to talk to someone who has done it."
        placeholderTextColor={colors.textMuted}
        value={need}
        onChangeText={setNeed}
        multiline
        maxLength={600}
        style={styles.input}
      />
      <Button title="Send request" onPress={onSend} loading={isPending} fullWidth />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
