import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, typography } from '@/constants/theme';
import { formatCurrency, formatRating } from '@/lib/format';
import type { Expert } from '@/types/user';

export type ExpertCardProps = {
  expert: Expert;
  onPress?: () => void;
};

// Compact people-row for Discover — face left, essentials right. Optimized for
// scanning many experts per screen; the full portrait treatment lives on the
// expert's profile page.
export const ExpertCard = ({ expert, onPress }: ExpertCardProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar uri={expert.avatarUrl} name={expert.displayName} size={64} />
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {expert.displayName}
          </Text>
          {expert.verified ? (
            <Text style={styles.verified} numberOfLines={1}>
              ✓ Verified
            </Text>
          ) : null}
        </View>
        <Text style={styles.headline} numberOfLines={2}>
          {expert.headline}
        </Text>
        <Text style={styles.footer} numberOfLines={1}>
          {expert.ratingCount > 0 ? (
            <>
              <Text style={styles.star}>★ </Text>
              {formatRating(expert.ratingAverage)} ({expert.ratingCount})
            </>
          ) : (
            <Text style={styles.newLabel}>New</Text>
          )}
          <Text style={styles.dot}> · </Text>
          {formatCurrency(expert.hourlyRate)}/hr
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.7 },
  content: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
  verified: { ...typography.label, color: colors.success },
  headline: { ...typography.caption, color: colors.textSecondary },
  footer: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  star: { color: colors.accent },
  newLabel: { ...typography.caption, color: colors.textMuted },
  dot: { color: colors.textMuted },
});
