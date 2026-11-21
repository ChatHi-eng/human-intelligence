import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

export type CardProps = ViewProps & {
  padded?: boolean;
  /** Kept for callers; cards are flat now and sit on a hairline. */
  elevated?: boolean;
  style?: ViewStyle;
};

// A quiet outlined box. No shadow: a page of boxes that all float reads as
// noise, so depth is saved for things that really sit above the page.
export const Card = ({ padded = true, style, children, elevated: _elevated, ...rest }: CardProps) => (
  <View {...rest} style={[styles.base, padded && styles.padded, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: spacing.lg },
});
