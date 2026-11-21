import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, spacing, typography } from '@/constants/theme';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  style?: ViewStyle;
};

// A small status or fact, written the way you would say it ("Confirmed",
// "Awaiting expert"), never in capitals. Colour is only for states that mean
// something: green for good, amber for waiting.
export const Badge = ({ label, tone = 'neutral', icon, style }: BadgeProps) => (
  <View style={[styles.base, toneStyles[tone].container, style]}>
    {icon ? <Icon name={icon} size={14} color={toneStyles[tone].text.color} /> : null}
    <Text style={[styles.text, toneStyles[tone].text]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: { ...typography.label },
});

const toneStyles: Record<BadgeTone, { container: ViewStyle; text: { color: string } }> = {
  neutral: { container: { backgroundColor: colors.surfaceAlt }, text: { color: colors.textPrimary } },
  accent: { container: { backgroundColor: colors.accentSoft }, text: { color: colors.accentInk } },
  success: { container: { backgroundColor: colors.successSoft }, text: { color: colors.success } },
  warning: { container: { backgroundColor: colors.warningSoft }, text: { color: colors.warning } },
};
