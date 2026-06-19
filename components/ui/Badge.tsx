import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
};

export const Badge = ({ label, tone = 'neutral', style }: BadgeProps) => (
  <View style={[styles.base, toneStyles[tone].container, style]}>
    <Text style={[styles.text, toneStyles[tone].text]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { ...typography.label, textTransform: 'uppercase' },
});

const toneStyles: Record<BadgeTone, { container: ViewStyle; text: { color: string } }> = {
  neutral: { container: { backgroundColor: colors.surfaceAlt }, text: { color: colors.textPrimary } },
  accent: { container: { backgroundColor: colors.accentSoft }, text: { color: colors.accent } },
  success: { container: { backgroundColor: '#E1F0E3' }, text: { color: colors.success } },
  warning: { container: { backgroundColor: '#FBEFD2' }, text: { color: colors.warning } },
};
