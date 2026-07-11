import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { Credential } from '@/types/user';

export type CredentialBadgeProps = {
  credential: Credential;
};

const TYPE_EMOJI = {
  work: '💼',
  education: '🎓',
  certification: '📜',
  other: '✨',
} as const;

export const CredentialBadge = ({ credential }: CredentialBadgeProps) => {
  const range = credential.endYear
    ? `${credential.year}–${credential.endYear}`
    : credential.type === 'work'
      ? `${credential.year}–Present`
      : `${credential.year}`;
  // Education leads with the school (issuer); everything else leads with the title.
  const primary = credential.type === 'education' ? credential.issuer : credential.title;
  const secondaryName = credential.type === 'education' ? credential.title : credential.issuer;
  const secondary = [secondaryName, range].filter(Boolean).join(' · ');
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {TYPE_EMOJI[credential.type]} {primary}
      </Text>
      {secondary ? <Text style={styles.meta}>{secondary}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
});
