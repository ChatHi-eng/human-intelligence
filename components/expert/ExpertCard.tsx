import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import { formatCurrency, formatRating, initials } from '@/lib/format';
import type { Expert } from '@/types/user';

export type ExpertCardProps = {
  expert: Expert;
  onPress?: () => void;
};

// Portrait-first card for the Discover grid — the person's photo IS the card.
// No cover banners; falls back to big initials on brand mint when there's no
// profile photo yet.
export const ExpertCard = ({ expert, onPress }: ExpertCardProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.photoWrap}>
        {expert.avatarUrl ? (
          <Image
            source={{ uri: expert.avatarUrl }}
            style={styles.photo}
            transition={200}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={styles.photoInitials}>{initials(expert.displayName)}</Text>
          </View>
        )}
        {expert.verified ? (
          <View style={styles.verifiedWrap}>
            <Badge label="Verified" tone="success" />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {expert.displayName}
        </Text>
        <Text style={styles.headline} numberOfLines={2}>
          {expert.headline}
        </Text>
        <Text style={styles.footer} numberOfLines={1}>
          {expert.ratingCount > 0 ? (
            <>
              <Text style={styles.star}>★ </Text>
              <Text style={styles.rating}>
                {formatRating(expert.ratingAverage)} ({expert.ratingCount})
              </Text>
            </>
          ) : (
            <Text style={styles.newLabel}>New</Text>
          )}
          <Text style={styles.dot}> · </Text>
          <Text style={styles.rate}>{formatCurrency(expert.hourlyRate)}/hr</Text>
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceAlt },
  photoFallback: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitials: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 40,
    color: colors.accent,
  },
  verifiedWrap: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  body: { padding: spacing.md, gap: 2 },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  headline: { ...typography.caption, color: colors.textSecondary, minHeight: 34 },
  footer: { ...typography.caption, color: colors.textPrimary, marginTop: spacing.xs },
  star: { color: colors.accent },
  rating: { ...typography.caption, color: colors.textPrimary },
  newLabel: { ...typography.caption, color: colors.textMuted },
  dot: { color: colors.textMuted },
  rate: { ...typography.caption, color: colors.textPrimary },
});
