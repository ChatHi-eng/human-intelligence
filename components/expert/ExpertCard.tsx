import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { MIN_REVIEWS_FOR_RATING } from '@/constants/business';
import { industryDisplay } from '@/constants/industries';
import { colors, spacing, typography } from '@/constants/theme';
import { formatDay } from '@/lib/date';
import { nextOpening } from '@/lib/discover';
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
  const field = industryDisplay(expert.industryId, expert.industryCustom);
  const role = [expert.currentTitle, expert.currentCompany].filter(Boolean).join(' at ');
  const opening = nextOpening(expert);
  // One quiet line of context: who they are and for how long.
  const context = [role || field?.label, `${expert.yearsExperience} yrs`].filter(Boolean).join(' · ');
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
        <Text style={styles.context} numberOfLines={1}>
          {context}
        </Text>
        <Text style={styles.headline} numberOfLines={2}>
          {expert.headline}
        </Text>
        {expert.introEnabled ? <Text style={styles.intro}>Free 15-minute intro</Text> : null}
        <Text style={styles.footer} numberOfLines={1}>
          {expert.ratingCount >= MIN_REVIEWS_FOR_RATING ? (
            <>
              <Text style={styles.star}>★ </Text>
              {formatRating(expert.ratingAverage)} ({expert.ratingCount})
            </>
          ) : (
            <Text style={styles.newLabel}>New on Palam</Text>
          )}
          <Text style={styles.dot}> · </Text>
          {expert.sessionPrice !== null ? (
            `${formatCurrency(expert.sessionPrice)} per session`
          ) : (
            <Text style={styles.newLabel}>Price coming soon</Text>
          )}
          <Text style={styles.dot}> · </Text>
          {opening ? (
            <Text style={styles.opening}>Next: {formatDay(opening)}</Text>
          ) : (
            <Text style={styles.newLabel}>No open times</Text>
          )}
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
  context: { ...typography.caption, color: colors.textMuted },
  headline: { ...typography.caption, color: colors.textSecondary },
  opening: { ...typography.caption, color: colors.accent },
  intro: { ...typography.caption, color: colors.success, fontWeight: '700' },
  footer: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  star: { color: colors.accent },
  newLabel: { ...typography.caption, color: colors.textMuted },
  dot: { color: colors.textMuted },
});
