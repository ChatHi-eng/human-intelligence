import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAddCredential, useDeleteCredential } from '@/hooks/useExperts';
import type { BackgroundType, Credential } from '@/types/user';

export type BackgroundEditorProps = {
  entries: Credential[];
};

type TypeOption = { id: BackgroundType; label: string; emoji: string };

const TYPES: TypeOption[] = [
  { id: 'work', label: 'Work', emoji: '💼' },
  { id: 'education', label: 'Education', emoji: '🎓' },
  { id: 'certification', label: 'Certification', emoji: '📜' },
  { id: 'other', label: 'Other', emoji: '✨' },
];

const SECTION_TITLES: Record<BackgroundType, string> = {
  work: 'Work experience',
  education: 'Education',
  certification: 'Certifications',
  other: 'Other',
};

const ISSUER_HINT: Record<BackgroundType, string> = {
  work: 'Company (e.g. Stripe)',
  education: 'School (e.g. Columbia)',
  certification: 'Issuer (e.g. AWS)',
  other: 'Source',
};

const TITLE_HINT: Record<BackgroundType, string> = {
  work: 'Role (e.g. Senior Engineer)',
  education: 'Degree (e.g. BS Computer Science)',
  certification: 'Name (e.g. Solutions Architect)',
  other: 'Title',
};

const currentYear = new Date().getFullYear();

export const BackgroundEditor = ({ entries }: BackgroundEditorProps) => {
  const [type, setType] = useState<BackgroundType>('work');
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [year, setYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const { mutate: add, isPending: adding } = useAddCredential();
  const { mutate: remove } = useDeleteCredential();

  const onAdd = () => {
    const t = title.trim();
    const i = issuer.trim();
    const y = Number(year);
    const ey = endYear.trim() ? Number(endYear) : null;
    if (!t || !i) {
      Toast.show({ type: 'error', text1: 'Title and source required' });
      return;
    }
    if (!Number.isFinite(y) || y < 1900 || y > currentYear + 1) {
      Toast.show({ type: 'error', text1: 'Year must be between 1900 and now' });
      return;
    }
    if (ey !== null && (!Number.isFinite(ey) || ey < y || ey > currentYear + 1)) {
      Toast.show({ type: 'error', text1: 'End year must be after start year' });
      return;
    }
    add(
      { type, title: t, issuer: i, year: y, endYear: ey },
      {
        onSuccess: () => {
          setTitle('');
          setIssuer('');
          setYear('');
          setEndYear('');
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

  const grouped = TYPES.map((t) => ({
    type: t,
    items: entries.filter((e) => e.type === t.id),
  })).filter((g) => g.items.length > 0);

  return (
    <View style={{ gap: spacing.lg }}>
      {grouped.length === 0 ? (
        <Text style={styles.empty}>
          Nothing here yet — add your work, education, or certifications below.
        </Text>
      ) : (
        grouped.map(({ type: t, items }) => (
          <View key={t.id} style={{ gap: spacing.sm }}>
            <Text style={styles.groupTitle}>
              {t.emoji} {SECTION_TITLES[t.id]}
            </Text>
            {items.map((e) => (
              <View key={e.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{e.title}</Text>
                  <Text style={styles.meta}>
                    {e.issuer} · {e.year}
                    {e.endYear ? `–${e.endYear}` : e.type === 'work' ? '–Present' : ''}
                  </Text>
                </View>
                <Pressable onPress={() => remove(e.id)} hitSlop={12}>
                  <Text style={styles.delete}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ))
      )}

      <View style={styles.adder}>
        <Text style={styles.adderTitle}>Add entry</Text>
        <View style={styles.typeChips}>
          {TYPES.map((t) => {
            const active = t.id === type;
            return (
              <Pressable
                key={t.id}
                onPress={() => setType(t.id)}
                style={[chipStyles.chip, active && chipStyles.active]}
              >
                <Text style={[chipStyles.text, active && chipStyles.activeText]}>
                  {t.emoji} {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          placeholder={TITLE_HINT[type]}
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          maxLength={120}
        />
        <TextInput
          placeholder={ISSUER_HINT[type]}
          placeholderTextColor={colors.textMuted}
          value={issuer}
          onChangeText={setIssuer}
          style={styles.input}
          maxLength={120}
        />
        <View style={styles.yearRow}>
          <TextInput
            placeholder={type === 'work' ? 'Start year' : 'Year'}
            placeholderTextColor={colors.textMuted}
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            style={[styles.input, { flex: 1 }]}
            maxLength={4}
          />
          <TextInput
            placeholder={type === 'work' ? 'End year (blank if current)' : 'End year (optional)'}
            placeholderTextColor={colors.textMuted}
            value={endYear}
            onChangeText={setEndYear}
            keyboardType="number-pad"
            style={[styles.input, { flex: 1 }]}
            maxLength={4}
          />
        </View>
        <Button title="Add" variant="secondary" onPress={onAdd} loading={adding} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  groupTitle: { ...typography.bodyStrong, color: colors.textPrimary },
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
  adder: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  adderTitle: { ...typography.bodyStrong, color: colors.textPrimary, marginBottom: spacing.xs },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  yearRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  active: { backgroundColor: colors.textPrimary },
  text: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  activeText: { color: '#FFFFFF' },
});
