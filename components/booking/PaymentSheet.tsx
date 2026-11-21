import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { formatCurrency } from '@/lib/format';
import { stripePublishableKey } from '@/services/stripe';

// True while the app is built with Stripe's test key. Real cards are refused
// in that mode, so the sheet says so and gives the card that works. The
// notice disappears by itself once the live key is in place.
const STRIPE_TEST_MODE = Boolean(stripePublishableKey?.startsWith('pk_test'));

export type PaymentSheetProps = {
  amountCents: number;
  expertName: string;
  /** true when the expert approves each request: the card is held, not charged. */
  holdOnly?: boolean;
  onPay: () => void;
  loading?: boolean;
};

export const PaymentSheet = ({
  amountCents,
  expertName,
  holdOnly,
  onPay,
  loading,
}: PaymentSheetProps) => (
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
    <View style={styles.fineprint}>
      <Text style={styles.policy}>Free cancellation until 24 hours before your session.</Text>
      <Text style={styles.notice}>
        {holdOnly
          ? `${expertName} approves each request. Your card is held, not charged, until they accept. If they decline or do not answer within 24 hours, the hold is released and you pay nothing.`
          : 'You pay on the next screen, and your session is confirmed as soon as the payment goes through.'}
      </Text>
      {STRIPE_TEST_MODE ? (
        <Text style={styles.testMode}>
          Palam is in test mode, so no real money moves. Pay with the test card 4242 4242 4242
          4242, any future date and any 3 digits.
        </Text>
      ) : null}
    </View>
    <Button
      title={loading ? 'Opening payment…' : holdOnly ? 'Request session' : 'Pay and book'}
      onPress={onPay}
      loading={loading}
      fullWidth
    />
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
  fineprint: { gap: spacing.sm },
  policy: { ...typography.caption, color: colors.textSecondary },
  notice: { ...typography.caption, color: colors.textMuted },
  testMode: {
    ...typography.caption,
    color: colors.textPrimary,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
});
