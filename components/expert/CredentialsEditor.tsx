import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAddCredential, useDeleteCredential } from '@/hooks/useExperts';
import type { Credential } from '@/types/user';

export type CredentialsEditorProps = {
  credentials: Credential[];
};

const currentYear = new Date().getFullYear();

export const CredentialsEditor = ({ credentials }: CredentialsEditorProps) => {
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [year, setYear] = useState('');
  const { mutate: add, isPending: adding } = useAddCredential();
  const { mutate: remove } = useDeleteCredential();

  const onAdd = () => {
    const t = title.trim();
    const i = issuer.trim();
    const y = Number(year);
    if (!t || !i) {
      Toast.show({ type: 'error', text1: 'Title and issuer required' });
      return;
    }
    if (!Number.isFinite(y) || y < 1900 || y > currentYear + 1) {
      Toast.show({ type: 'error', text1: 'Year must be between 1900 and now' });
      return;
    }
    add(
      { title: t, issuer: i, year: y },
      {
        onSuccess: () => {
          setTitle('');
          setIssuer('');
          setYear('');
        },
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not add',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  return (
    <View style={{ gap: spacing.md }}>
      {credentials.length > 0 ? (
        credentials.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{c.title}</Text>
              <Text style={styles.meta}>
                {c.issuer} · {c.year}
              </Text>
            </View>
            <Pressable onPress={() => remove(c.id)} hitSlop={12}>
              <Text style={styles.delete}>Remove</Text>
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No credentials yet — add one below.</Text>
      )}

      <View style={styles.adder}>
        <TextInput
          placeholder="Title (e.g. JD)"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          maxLength={80}
        />
        <TextInput
          placeholder="Issuer (e.g. Columbia Law)"
          placeholderTextColor={colors.textMuted}
          value={issuer}
          onChangeText={setIssuer}
          style={styles.input}
          maxLength={120}
        />
        <TextInput
          placeholder="Year"
          placeholderTextColor={colors.textMuted}
          value={year}
          onChangeText={setYear}
          keyboardType="number-pad"
          style={styles.input}
          maxLength={4}
        />
        <Button title="Add credential" variant="secondary" onPress={onAdd} loading={adding} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  delete: { ...typography.bodyStrong, color: colors.danger },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  adder: { gap: spacing.sm, paddingTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
