import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/constants/theme';

export type ScreenProps = ViewProps & {
  padded?: boolean;
  scrollSafe?: boolean;
  contentStyle?: ViewStyle;
};

export const Screen = ({
  padded = true,
  scrollSafe = false,
  contentStyle,
  children,
  style,
  ...rest
}: ScreenProps) => {
  const insets = useSafeAreaInsets();
  const Container = scrollSafe ? View : SafeAreaView;
  return (
    <Container style={[styles.container, style]}>
      <View
        {...rest}
        style={[
          styles.content,
          padded && styles.padded,
          scrollSafe && { paddingTop: insets.top, paddingBottom: insets.bottom },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
});
