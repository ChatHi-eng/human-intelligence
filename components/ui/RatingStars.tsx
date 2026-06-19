import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { formatRating } from '@/lib/format';

export type RatingStarsProps = {
  value: number;
  count?: number;
  interactive?: boolean;
  onChange?: (rating: 1 | 2 | 3 | 4 | 5) => void;
  size?: number;
};

const stars: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

export const RatingStars = ({
  value,
  count,
  interactive,
  onChange,
  size = 16,
}: RatingStarsProps) => (
  <View style={styles.row}>
    {stars.map((n) => {
      const filled = n <= Math.round(value);
      const content = (
        <Text style={[styles.star, { fontSize: size, color: filled ? colors.accent : colors.border }]}>
          ★
        </Text>
      );
      return interactive ? (
        <Pressable key={n} onPress={() => onChange?.(n)} hitSlop={8}>
          {content}
        </Pressable>
      ) : (
        <View key={n}>{content}</View>
      );
    })}
    {typeof count === 'number' && (
      <Text style={styles.label}>
        {formatRating(value)} <Text style={styles.muted}>({count})</Text>
      </Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  star: { lineHeight: 18 },
  label: { marginLeft: spacing.xs, color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  muted: { color: colors.textMuted, fontWeight: '400' },
});
