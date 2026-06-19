import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';

export type LoadingViewProps = {
  label?: string;
};

export const LoadingView = ({ label = 'Loading…' }: LoadingViewProps) => (
  <View style={styles.container}>
    <ActivityIndicator color={colors.textPrimary} />
    <Text style={styles.label}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { ...typography.caption, color: colors.textMuted },
});
