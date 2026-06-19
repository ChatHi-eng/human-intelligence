import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { Credential } from '@/types/user';

export type CredentialBadgeProps = {
  credential: Credential;
};

export const CredentialBadge = ({ credential }: CredentialBadgeProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>{credential.title}</Text>
    <Text style={styles.meta}>
      {credential.issuer} · {credential.year}
    </Text>
  </View>
);

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
