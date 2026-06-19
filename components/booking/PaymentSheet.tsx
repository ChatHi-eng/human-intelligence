import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { formatCurrency } from '@/lib/format';

export type PaymentSheetProps = {
  amountCents: number;
  expertName: string;
  onPay: () => void;
  loading?: boolean;
};

export const PaymentSheet = ({ amountCents, expertName, onPay, loading }: PaymentSheetProps) => (
  <View style={styles.container}>
    <View style={styles.summary}>
      <View style={styles.row}>
        <Text style={styles.label}>Session with</Text>
        <Text style={styles.value}>{expertName}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Total</Text>
        <Text style={styles.total}>{formatCurrency(amountCents)}</Text>
      </View>
    </View>
    <Text style={styles.notice}>
      Payment is authorized now and captured after the call. Stripe runs in stub mode until a dev
      build is wired up.
    </Text>
    <Button title="Confirm and pay" onPress={onPay} loading={loading} fullWidth />
  </View>
);

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.body, color: colors.textSecondary },
  value: { ...typography.bodyStrong, color: colors.textPrimary },
  total: { ...typography.title, color: colors.textPrimary },
  notice: { ...typography.caption, color: colors.textMuted },
});
