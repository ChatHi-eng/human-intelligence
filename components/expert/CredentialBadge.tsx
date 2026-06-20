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
  const range =
    credential.endYear
      ? `${credential.year}–${credential.endYear}`
      : credential.type === 'work'
        ? `${credential.year}–Present`
        : `${credential.year}`;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {TYPE_EMOJI[credential.type]} {credential.title}
      </Text>
      <Text style={styles.meta}>
        {credential.issuer} · {range}
      </Text>
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
