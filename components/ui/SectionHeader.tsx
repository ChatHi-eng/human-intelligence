import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';

export type SectionHeaderProps = {
  title: string;
  caption?: string;
};

export const SectionHeader = ({ title, caption }: SectionHeaderProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    {caption ? <Text style={styles.caption}>{caption}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: { gap: spacing.xs, marginBottom: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary },
});
