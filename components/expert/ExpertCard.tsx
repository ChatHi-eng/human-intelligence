import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Portrait } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MIN_REVIEWS_FOR_RATING } from '@/constants/business';
import { industryDisplay } from '@/constants/industries';
import { colors, fonts, radius, spacing, typography } from '@/constants/theme';
import { nextOpening, openingLabel } from '@/lib/discover';
import { formatCurrency, formatRating } from '@/lib/format';
import type { Expert } from '@/types/user';

export type ExpertCardProps = {
  expert: Expert;
  onPress?: () => void;
};

// The small white tag on a vetted expert's photo. It is Palam's one signature
// mark, so it appears on photos and nowhere else.
export const VettedTag = () => (
  <View style={styles.vetted}>
    <Icon name="check-circle" size={14} color={colors.accent} />
    <Text style={styles.vettedText}>Vetted</Text>
  </View>
);

// A person on Discover: their photo first and large, then who they are, how
// they are rated, what a session costs and when they are next free.
export const ExpertCard = ({ expert, onPress }: ExpertCardProps) => {
  const field = industryDisplay(expert.industryId, expert.industryCustom);
  const opening = nextOpening(expert);
  const context = [expert.currentTitle || field?.label, `${expert.yearsExperience} years`]
    .filter(Boolean)
    .join(' · ');
  const rated = expert.ratingCount >= MIN_REVIEWS_FOR_RATING;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View>
        <Portrait uri={expert.avatarUrl} name={expert.displayName} height={200} />
        {expert.verified ? <VettedTag /> : null}
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.name} numberOfLines={1}>
          {expert.displayName}
        </Text>
        {rated ? (
          <Text style={styles.rating}>
            ★ {formatRating(expert.ratingAverage)}{' '}
            <Text style={styles.muted}>({expert.ratingCount})</Text>
          </Text>
        ) : (
          <Text style={styles.muted}>New on Palam</Text>
        )}
      </View>
      <Text style={styles.line} numberOfLines={1}>
        {context}
      </Text>
      <Text style={styles.line} numberOfLines={2}>
        {expert.headline}
      </Text>
      <Text style={styles.line} numberOfLines={1}>
        {opening ? openingLabel(opening) : 'No open times'}
      </Text>
      <Text style={styles.priceLine} numberOfLines={1}>
        {expert.sessionPrice !== null ? (
          <>
            <Text style={styles.price}>{formatCurrency(expert.sessionPrice)}</Text> per session
          </>
        ) : (
          'Price coming soon'
        )}
        {expert.introEnabled ? <Text style={styles.intro}> · Free 15-minute intro</Text> : null}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { gap: 2, paddingBottom: spacing.sm },
  pressed: { opacity: 0.85 },
  vetted: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  vettedText: { ...typography.label, fontFamily: fonts.semiBold, color: colors.textPrimary },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  name: { ...typography.bodyStrong, fontSize: 16, color: colors.textPrimary, flexShrink: 1 },
  rating: { ...typography.body, color: colors.textPrimary },
  muted: { ...typography.body, color: colors.textMuted },
  line: { ...typography.body, color: colors.textSecondary },
  priceLine: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
  price: { fontFamily: fonts.semiBold },
  intro: { fontFamily: fonts.semiBold, color: colors.accentInk },
});
