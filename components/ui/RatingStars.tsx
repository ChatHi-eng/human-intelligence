import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '@/constants/theme';
import { formatRating } from '@/lib/format';

export type RatingStarsProps = {
  value: number;
  count?: number;
  interactive?: boolean;
  onChange?: (rating: 1 | 2 | 3 | 4 | 5) => void;
  size?: number;
};

const stars: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

// Showing a rating: one star and the number ("★ 4.8 (6)"), the way people
// read it at a glance. Giving a rating: five stars to tap.
export const RatingStars = ({
  value,
  count,
  interactive,
  onChange,
  size = 16,
}: RatingStarsProps) => {
  if (!interactive && typeof count === 'number') {
    return (
      <View style={styles.row}>
        <Text style={[styles.star, { fontSize: size, color: colors.textPrimary }]}>★</Text>
        <Text style={styles.label}>
          {formatRating(value)} <Text style={styles.muted}>({count})</Text>
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {stars.map((n) => {
        const filled = n <= Math.round(value);
        const content = (
          <Text
            style={[styles.star, { fontSize: size, color: filled ? colors.textPrimary : colors.border }]}
          >
            ★
          </Text>
        );
        return interactive ? (
          <Pressable
            key={n}
            onPress={() => onChange?.(n)}
            hitSlop={8}
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          >
            {content}
          </Pressable>
        ) : (
          <View key={n}>{content}</View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  star: { lineHeight: 20 },
  label: { ...typography.caption, fontFamily: fonts.semiBold, color: colors.textPrimary },
  muted: { fontFamily: fonts.regular, color: colors.textMuted },
});
