import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';

export type SectionHeaderProps = {
  title: string;
  caption?: string;
  /** `page` is the one big title at the top of a screen; `section` sits inside it. */
  level?: 'page' | 'section';
};

export const SectionHeader = ({ title, caption, level = 'section' }: SectionHeaderProps) => (
  <View style={styles.container}>
    <Text style={level === 'page' ? styles.pageTitle : styles.title}>{title}</Text>
    {caption ? <Text style={styles.caption}>{caption}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: { gap: spacing.xs, marginBottom: spacing.md },
  pageTitle: { ...typography.display, color: colors.textPrimary },
  title: { ...typography.heading, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary },
});
