import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { RatingStars } from '@/components/ui/RatingStars';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import { industryById } from '@/constants/industries';
import { formatCurrency } from '@/lib/format';
import type { Expert } from '@/types/user';

export type ExpertCardProps = {
  expert: Expert;
  onPress?: () => void;
};

export const ExpertCard = ({ expert, onPress }: ExpertCardProps) => {
  const industry = industryById(expert.industryId);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {expert.coverImageUrl ? (
        <Image
          source={{ uri: expert.coverImageUrl }}
          style={styles.cover}
          transition={200}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Text style={styles.coverEmoji}>{industry?.emoji ?? '🌱'}</Text>
        </View>
      )}
      {/* The human is the product — always show a face (or initials) even
          when there's no cover photo. */}
      <View style={styles.avatarWrap}>
        <Avatar uri={expert.avatarUrl} name={expert.displayName} size={56} />
      </View>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          {industry ? (
            <Badge label={`${industry.emoji}  ${industry.label}`} tone="neutral" />
          ) : null}
          {expert.verified ? <Badge label="Verified" tone="success" /> : null}
        </View>
        <Text style={styles.name}>{expert.displayName}</Text>
        <Text style={styles.headline} numberOfLines={2}>
          {expert.headline}
        </Text>
        <View style={styles.footerRow}>
          {expert.ratingCount > 0 ? (
            <RatingStars value={expert.ratingAverage} count={expert.ratingCount} />
          ) : (
            <Text style={styles.newLabel}>New on Palam</Text>
          )}
          <Text style={styles.rate}>{formatCurrency(expert.hourlyRate)}/hr</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cover: { width: '100%', height: 160, backgroundColor: colors.surfaceAlt },
  coverFallback: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmoji: { fontSize: 48 },
  avatarWrap: {
    position: 'absolute',
    top: 160 - 28,
    left: spacing.lg,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: colors.background,
    backgroundColor: colors.background,
    zIndex: 1,
  },
  body: { padding: spacing.lg, paddingTop: spacing.xl + spacing.sm, gap: spacing.sm },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  name: { ...typography.heading, color: colors.textPrimary },
  headline: { ...typography.body, color: colors.textSecondary },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  newLabel: { ...typography.caption, color: colors.textMuted },
  rate: { ...typography.bodyStrong, color: colors.textPrimary },
});
