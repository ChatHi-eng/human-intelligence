import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Portrait } from '@/components/ui/Avatar';
import { colors, fonts, spacing, typography } from '@/constants/theme';
import { nextOpening, openingLabel } from '@/lib/discover';
import { formatCurrency } from '@/lib/format';
import type { Expert } from '@/types/user';

export type ExpertRowProps = {
  title: string;
  experts: Expert[];
  onPressExpert: (expert: Expert) => void;
};

// A titled, sideways-scrolling row of people for the home screen ("Available
// this week", one row per field). Photo on top, three short lines under it.
export const ExpertRow = ({ title, experts, onPressExpert }: ExpertRowProps) => {
  if (experts.length === 0) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {experts.map((expert) => {
          const opening = nextOpening(expert);
          return (
            <Pressable
              key={expert.id}
              onPress={() => onPressExpert(expert)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <Portrait uri={expert.avatarUrl} name={expert.displayName} height={148} />
              <Text style={styles.name} numberOfLines={1}>
                {expert.displayName}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {expert.currentTitle || expert.headline}
              </Text>
              {opening ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {openingLabel(opening)}
                </Text>
              ) : null}
              <Text style={styles.priceLine} numberOfLines={1}>
                {expert.sessionPrice !== null ? (
                  <>
                    <Text style={styles.price}>{formatCurrency(expert.sessionPrice)}</Text> per
                    session
                  </>
                ) : (
                  'Price coming soon'
                )}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.textPrimary },
  row: { gap: spacing.md },
  card: { width: 148, gap: 2 },
  name: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: spacing.sm },
  meta: { ...typography.caption, color: colors.textSecondary },
  priceLine: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  price: { fontFamily: fonts.semiBold },
});
