import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BookingCard } from '@/components/booking/BookingCard';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useEarningsBuckets } from '@/hooks/useEarnings';
import { useMyBookings } from '@/hooks/useBookings';
import { useExperts } from '@/hooks/useExperts';
import { formatCurrency } from '@/lib/format';
import { isoDateKey } from '@/lib/date';

export default function ExpertDashboardScreen() {
  const { data: bookings, isLoading: bookingsLoading } = useMyBookings();
  const { data: experts } = useExperts();
  const { data: earnings, isLoading: earningsLoading } = useEarningsBuckets();
  const expertsById = new Map(experts?.map((e) => [e.id, e]) ?? []);
  const today = isoDateKey(new Date().toISOString());
  const todays = (bookings ?? []).filter((b) => isoDateKey(b.slot.startIso) === today);
  const todayBucket = earnings?.[0];

  if ((bookingsLoading && !bookings) || (earningsLoading && !earnings)) {
    return <LoadingView label="Loading dashboard…" />;
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionHeader title="Today" caption="Your schedule and earnings at a glance." />
        <View style={styles.stats}>
          <StatCard label="Bookings today" value={`${todays.length}`} />
          <StatCard
            label="Earned today"
            value={todayBucket ? formatCurrency(todayBucket.payoutCents) : '—'}
          />
        </View>
        <SectionHeader title="Today's calls" />
        {todays.length === 0 ? (
          <EmptyState
            title="No calls today"
            description="Enjoy your day — or open up more availability."
            emoji="☕"
          />
        ) : (
          todays.map((b) => (
            <BookingCard key={b.id} booking={b} expert={expertsById.get(b.expertId)} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <Card style={{ flex: 1 }}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </Card>
);

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  statValue: { ...typography.title, color: colors.textPrimary, marginTop: 4 },
});
