import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      <Image
        source={{ uri: expert.coverImageUrl }}
        style={styles.cover}
        transition={200}
        contentFit="cover"
      />
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
          <RatingStars value={expert.ratingAverage} count={expert.ratingCount} />
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
  cover: { width: '100%', height: 180, backgroundColor: colors.surfaceAlt },
  body: { padding: spacing.lg, gap: spacing.sm },
  headerRow: { flexDirection: 'row', gap: spacing.sm },
  name: { ...typography.heading, color: colors.textPrimary },
  headline: { ...typography.body, color: colors.textSecondary },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  rate: { ...typography.bodyStrong, color: colors.textPrimary },
});
