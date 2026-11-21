import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, spacing, typography } from '@/constants/theme';

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: IconName;
};

// What a screen shows when there is nothing in it yet: one line icon, a plain
// title, and a sentence on what happens next.
export const EmptyState = ({ title, description, icon = 'inbox' }: EmptyStateProps) => (
  <View style={styles.container}>
    <View style={styles.iconWrap}>
      <Icon name={icon} size={24} color={colors.textPrimary} />
    </View>
    <Text style={styles.title}>{title}</Text>
    {description ? <Text style={styles.description}>{description}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary, textAlign: 'center' },
  description: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 320 },
});
