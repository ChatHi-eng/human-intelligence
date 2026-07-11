import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useDailyEarningsSeries, useEarningsBuckets } from '@/hooks/useEarnings';
import { formatCurrency } from '@/lib/format';

export default function ExpertEarningsScreen() {
  const { data: buckets, isLoading } = useEarningsBuckets();
  const { data: daily } = useDailyEarningsSeries();

  if (isLoading && !buckets) return <LoadingView label="Loading earnings…" />;

  const chartData =
    daily?.map((cents, i) => ({
      value: cents / 100,
      label: i % 2 === 0 ? `${i + 1}` : '',
      frontColor: colors.accent,
    })) ?? [];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionHeader title="Earnings" caption="Daily / weekly / monthly. Payouts via Stripe Connect (stub)." />
        <View style={styles.row}>
          {buckets?.map((b) => (
            <Card key={b.periodLabel} style={{ flex: 1 }}>
              <Text style={styles.label}>{b.periodLabel}</Text>
              <Text style={styles.value}>{formatCurrency(b.payoutCents)}</Text>
              <Text style={styles.meta}>{b.bookingCount} bookings</Text>
            </Card>
          ))}
        </View>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={styles.cardTitle}>Last 14 days</Text>
          <BarChart
            data={chartData}
            barWidth={14}
            spacing={10}
            roundedTop
            roundedBottom
            hideRules
            yAxisThickness={0}
            xAxisThickness={0}
            xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 11 }}
            yAxisTextStyle={{ color: colors.textMuted, fontSize: 11 }}
            noOfSections={4}
          />
        </Card>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={styles.cardTitle}>Payouts</Text>
          <Text style={styles.cardBody}>
            Stripe Connect onboarding will let you receive automatic payouts. Wiring up after the
            UI scaffold is approved.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.heading, color: colors.textPrimary, marginTop: 4 },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, marginBottom: spacing.sm },
  cardBody: { ...typography.body, color: colors.textSecondary },
});
