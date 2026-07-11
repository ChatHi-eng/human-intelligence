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

type SectionConfig = {
  type: BackgroundType;
  sectionTitle: string;
  addLabel: string;
  // Field labels/placeholders per type. `issuerFirst` puts the issuer field on
  // top (LinkedIn shows School before Degree).
  titleLabel: string;
  titlePlaceholder: string;
  issuerLabel: string;
  issuerPlaceholder: string;
  issuerOptional?: boolean;
  issuerFirst?: boolean;
  yearLabel: string;
  hasEndYear: boolean;
  hasCurrentToggle?: boolean;
};

const SECTIONS: SectionConfig[] = [
  {
    type: 'work',
    sectionTitle: 'Work experience',
    addLabel: '+ Add work experience',
    titleLabel: 'Role',
    titlePlaceholder: 'e.g. Senior Engineer',
    issuerLabel: 'Company',
    issuerPlaceholder: 'e.g. Stripe',
    yearLabel: 'Start year',
    hasEndYear: true,
    hasCurrentToggle: true,
  },
  {
    type: 'education',
    sectionTitle: 'Education',
    addLabel: '+ Add education',
    titleLabel: 'Degree',
    titlePlaceholder: 'e.g. BS Computer Science',
    issuerLabel: 'School',
    issuerPlaceholder: 'e.g. Carnegie Mellon',
    issuerFirst: true,
    yearLabel: 'Start year',
    hasEndYear: true,
  },
  {
    type: 'certification',
    sectionTitle: 'Certifications & licenses',
    addLabel: '+ Add certification',
    titleLabel: 'Name',
    titlePlaceholder: 'e.g. NY Bar, AWS Solutions Architect',
    issuerLabel: 'Issuing organization',
    issuerPlaceholder: 'e.g. State of New York',
    yearLabel: 'Year',
    hasEndYear: false,
  },
  {
    type: 'other',
    sectionTitle: 'Other',
    addLabel: '+ Add other',
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. Open-source maintainer',
    issuerLabel: 'Source (optional)',
    issuerPlaceholder: 'Where is this from?',
    issuerOptional: true,
    yearLabel: 'Year',
    hasEndYear: false,
  },
];

const currentYear = new Date().getFullYear();

// Display line per type, LinkedIn-ish: bold "primary" then secondary + years.
const entryDisplay = (e: Credential): { primary: string; secondary: string } => {
  const range = e.endYear
    ? `${e.year}–${e.endYear}`
    : e.type === 'work'
      ? `${e.year}–Present`
      : `${e.year}`;
  if (e.type === 'education') {
    // issuer = school (primary), title = degree
    return { primary: e.issuer, secondary: [e.title, range].filter(Boolean).join(' · ') };
  }
  return {
    primary: e.title,
    secondary: [e.issuer, range].filter(Boolean).join(' · '),
  };
};

export const BackgroundEditor = ({ entries }: BackgroundEditorProps) => {
  const [openForm, setOpenForm] = useState<BackgroundType | null>(null);
  const { mutate: remove } = useDeleteCredential();

  return (
    <View style={{ gap: spacing.lg }}>
      {SECTIONS.map((cfg) => {
        const items = entries.filter((e) => e.type === cfg.type);
        // Hide the empty "Other" section unless it has entries — it's a
        // catch-all, not something to advertise.
        if (cfg.type === 'other' && items.length === 0 && openForm !== 'other') {
          return (
            <Pressable key={cfg.type} onPress={() => setOpenForm('other')}>
              <Text style={styles.otherLink}>{cfg.addLabel}</Text>
            </Pressable>
          );
        }
        return (
          <View key={cfg.type} style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{cfg.sectionTitle}</Text>
            {items.map((e) => {
              const { primary, secondary } = entryDisplay(e);
              return (
                <View key={e.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowPrimary}>{primary}</Text>
                    {secondary ? <Text style={styles.rowSecondary}>{secondary}</Text> : null}
                  </View>
                  <Pressable onPress={() => remove(e.id)} hitSlop={12}>
                    <Text style={styles.delete}>Remove</Text>
                  </Pressable>
                </View>
              );
            })}
            {openForm === cfg.type ? (
              <EntryForm config={cfg} onClose={() => setOpenForm(null)} />
            ) : (
              <Pressable onPress={() => setOpenForm(cfg.type)}>
                <Text style={styles.addLink}>{cfg.addLabel}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
};

const EntryForm = ({ config, onClose }: { config: SectionConfig; onClose: () => void }) => {
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [year, setYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const { mutate: add, isPending } = useAddCredential();

  const onSave = () => {
    const t = title.trim();
    const i = issuer.trim();
    if (!t) {
      Toast.show({ type: 'error', text1: `${config.titleLabel} is required` });
      return;
    }
    if (!i && !config.issuerOptional) {
      Toast.show({ type: 'error', text1: `${config.issuerLabel} is required` });
      return;
    }
    const y = Number(year);
    if (!Number.isFinite(y) || y < 1900 || y > currentYear + 1) {
      Toast.show({ type: 'error', text1: `Enter a valid ${config.yearLabel.toLowerCase()}` });
      return;
    }
    let ey: number | null = null;
    if (config.hasEndYear && !isCurrent && endYear.trim()) {
      ey = Number(endYear);
      if (!Number.isFinite(ey) || ey < y || ey > currentYear + 1) {
        Toast.show({ type: 'error', text1: 'End year must be after start year' });
        return;
      }
    }
    add(
      { type: config.type, title: t, issuer: i, year: y, endYear: ey },
      {
        onSuccess: onClose,
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not add',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  const titleField = (
    <View key="title" style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{config.titleLabel}</Text>
      <TextInput
        placeholder={config.titlePlaceholder}
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={setTitle}
        style={styles.input}
        maxLength={120}
      />
    </View>
  );
  const issuerField = (
    <View key="issuer" style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{config.issuerLabel}</Text>
      <TextInput
        placeholder={config.issuerPlaceholder}
        placeholderTextColor={colors.textMuted}
        value={issuer}
        onChangeText={setIssuer}
        style={styles.input}
        maxLength={120}
      />
    </View>
  );

  return (
    <View style={styles.form}>
      {config.issuerFirst ? [issuerField, titleField] : [titleField, issuerField]}

      <View style={styles.yearRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>{config.yearLabel}</Text>
          <TextInput
            placeholder={`${currentYear - 4}`}
            placeholderTextColor={colors.textMuted}
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            style={styles.input}
            maxLength={4}
          />
        </View>
        {config.hasEndYear && !isCurrent && (
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>End year (optional)</Text>
            <TextInput
              placeholder={`${currentYear}`}
              placeholderTextColor={colors.textMuted}
              value={endYear}
              onChangeText={setEndYear}
              keyboardType="number-pad"
              style={styles.input}
              maxLength={4}
            />
          </View>
        )}
      </View>

      {config.hasCurrentToggle && (
        <Pressable onPress={() => setIsCurrent((c) => !c)} style={styles.checkboxRow}>
          <View style={[styles.checkbox, isCurrent && styles.checkboxChecked]}>
            {isCurrent && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>I currently work here</Text>
        </Pressable>
      )}

      <View style={styles.formActions}>
        <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Save" onPress={onSave} loading={isPending} style={{ flex: 1 }} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: { ...typography.bodyStrong, color: colors.textPrimary },
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
  rowPrimary: { ...typography.bodyStrong, color: colors.textPrimary },
  rowSecondary: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  delete: { ...typography.bodyStrong, color: colors.danger },
  addLink: { ...typography.bodyStrong, color: colors.accent, paddingVertical: spacing.xs },
  otherLink: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.xs },
  form: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textSecondary },
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
  yearRow: { flexDirection: 'row', gap: spacing.sm },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  checkboxChecked: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  checkboxLabel: { ...typography.body, color: colors.textPrimary },
  formActions: { flexDirection: 'row', gap: spacing.sm },
});
