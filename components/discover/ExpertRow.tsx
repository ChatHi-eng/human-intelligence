import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { nextOpening, openingLabel } from '@/lib/discover';
import { formatCurrency } from '@/lib/format';
import type { Expert } from '@/types/user';

export type ExpertRowProps = {
  title: string;
  experts: Expert[];
  onPressExpert: (expert: Expert) => void;
};

// A titled, sideways-scrolling row of small expert cards for the home screen
// ("Available this week", one row per field).
export const ExpertRow = ({ title, experts, onPressExpert }: ExpertRowProps) => {
  if (experts.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {experts.map((expert) => {
          const opening = nextOpening(expert);
          const role = [expert.currentTitle, expert.currentCompany].filter(Boolean).join(' at ');
          return (
            <Pressable key={expert.id} onPress={() => onPressExpert(expert)} style={styles.card}>
              <Avatar uri={expert.avatarUrl} name={expert.displayName} size={56} />
              <Text style={styles.name} numberOfLines={1}>
                {expert.displayName}
              </Text>
              <Text style={styles.meta} numberOfLines={2}>
                {role || expert.headline}
              </Text>
              <Text style={styles.price} numberOfLines={1}>
                {expert.sessionPrice !== null
                  ? `${formatCurrency(expert.sessionPrice)} per session`
                  : 'Price coming soon'}
              </Text>
              {opening ? <Text style={styles.opening}>{openingLabel(opening)}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.textPrimary },
  row: { gap: spacing.md, paddingVertical: spacing.xs },
  card: {
    width: 168,
    padding: spacing.md,
    gap: 4,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  name: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: spacing.xs },
  meta: { ...typography.caption, color: colors.textSecondary, minHeight: 34 },
  price: { ...typography.caption, color: colors.textPrimary },
  opening: { ...typography.caption, color: colors.accent },
});
