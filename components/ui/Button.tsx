import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerQuiet';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

// One main action per screen is `primary` (Palam green). Everything beside it
// is `secondary` (white with an outline) or `ghost` (an underlined text
// action), so the green always means "this is the next step".
export const Button = ({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth,
  style,
}: ButtonProps) => {
  const visuallyDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={visuallyDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].container,
        fullWidth && styles.fullWidth,
        pressed && !visuallyDisabled && styles.pressed,
        visuallyDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].text.color} />
      ) : (
        <Text
          style={[styles.text, variantStyles[variant].text, variant === 'ghost' && styles.ghostText]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    height: 48,
    paddingHorizontal: spacing.lg + spacing.xs,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  text: { ...typography.bodyStrong, textAlign: 'center' },
  ghostText: { textDecorationLine: 'underline' },
});

const variantStyles: Record<
  Variant,
  { container: ViewStyle; text: { color: string } }
> = {
  primary: {
    container: { backgroundColor: colors.accent },
    text: { color: '#FFFFFF' },
  },
  secondary: {
    container: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.textPrimary,
    },
    text: { color: colors.textPrimary },
  },
  ghost: {
    container: { backgroundColor: 'transparent', paddingHorizontal: spacing.md },
    text: { color: colors.textPrimary },
  },
  danger: {
    container: { backgroundColor: colors.danger },
    text: { color: '#FFFFFF' },
  },
  // A way out that should not compete with the main action on the screen
  // (cancelling a booking next to "Join call").
  dangerQuiet: {
    container: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    text: { color: colors.danger },
  },
};
