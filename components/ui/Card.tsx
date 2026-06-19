import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '@/constants/theme';

export type CardProps = ViewProps & {
  padded?: boolean;
  elevated?: boolean;
  style?: ViewStyle;
};

export const Card = ({ padded = true, elevated = true, style, children, ...rest }: CardProps) => (
  <View
    {...rest}
    style={[styles.base, padded && styles.padded, elevated && shadow.card, style]}
  >
    {children}
  </View>
);

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  padded: { padding: spacing.lg },
});
