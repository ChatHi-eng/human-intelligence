import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Portrait } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MIN_REVIEWS_FOR_RATING } from '@/constants/business';
import { industryDisplay } from '@/constants/industries';
import { colors, fonts, spacing, typography } from '@/constants/theme';
import { nextOpening, openingLabel } from '@/lib/discover';
import { formatCurrency, formatRating } from '@/lib/format';
import type { Expert } from '@/types/user';

export type ExpertCardProps = {
  expert: Expert;
  onPress?: () => void;
};

// Profile photos are square, so they are always shown square. This is the
// size on a list: big enough to see the face, small enough that a phone
// screen still fits two or three people.
const PHOTO = 112;

// The small white mark on a vetted expert's photo. It is Palam's one
// signature mark, so it appears on photos and nowhere else.
export const VettedTag = () => (
  <View style={styles.vetted} accessibilityLabel="Vetted by Palam">
    <Icon name="check-circle" size={16} color={colors.accent} />
  </View>
);

// A person on Discover: their whole photo on the left, then who they are, how
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
      <View style={styles.photo}>
        <Portrait uri={expert.avatarUrl} name={expert.displayName} height={PHOTO} />
        {expert.verified ? <VettedTag /> : null}
      </View>
      <View style={styles.content}>
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
        <Text style={styles.priceLine} numberOfLines={2}>
          {expert.sessionPrice !== null ? (
            <>
              <Text style={styles.price}>{formatCurrency(expert.sessionPrice)}</Text> per session
            </>
          ) : (
            'Price coming soon'
          )}
          {expert.introEnabled ? <Text style={styles.intro}> · Free 15-minute intro</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  pressed: { opacity: 0.85 },
  photo: { width: PHOTO, height: PHOTO },
  vetted: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: { flex: 1, gap: 2, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: { ...typography.bodyStrong, fontSize: 16, color: colors.textPrimary, flexShrink: 1 },
  rating: { ...typography.caption, color: colors.textPrimary },
  muted: { ...typography.caption, color: colors.textMuted },
  line: { ...typography.caption, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  priceLine: { ...typography.caption, fontSize: 14, lineHeight: 20, color: colors.textPrimary, marginTop: 2 },
  price: { fontFamily: fonts.semiBold },
  intro: { fontFamily: fonts.semiBold, color: colors.accentInk },
});
