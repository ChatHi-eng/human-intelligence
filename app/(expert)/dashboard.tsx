import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BookingCard } from '@/components/booking/BookingCard';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import {
  useAcceptBooking,
  useDeclineBooking,
  useMyBookings,
  usePendingRequests,
} from '@/hooks/useBookings';
import { useEarningsBuckets } from '@/hooks/useEarnings';
import { useExperts, useMyExpertProfile } from '@/hooks/useExperts';
import { formatDateTime, isoDateKey, minutesBetween } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import type { Booking } from '@/types/booking';

export default function ExpertDashboardScreen() {
  const { data: me } = useMyExpertProfile();
  const { data: pending = [], isLoading: pendingLoading } = usePendingRequests();
  const { data: bookings, isLoading: bookingsLoading } = useMyBookings();
  const { data: experts } = useExperts();
  const { data: earnings, isLoading: earningsLoading } = useEarningsBuckets();
  const expertsById = new Map(experts?.map((e) => [e.id, e]) ?? []);
  const today = isoDateKey(new Date().toISOString());
  const myBookingsAsExpert = (bookings ?? []).filter(
    (b) => me && b.expertId === me.id && b.status === 'confirmed',
  );
  const todays = myBookingsAsExpert.filter((b) => isoDateKey(b.slot.startIso) === today);
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
          <StatCard label="Pending requests" value={`${pending.length}`} />
        </View>

        <SectionHeader title="Pending requests" caption="Customers waiting for your decision." />
        {pendingLoading && pending.length === 0 ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : pending.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="When someone books a session, you'll see it here to accept or decline."
            emoji="🌤️"
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {pending.map((p) => (
              <PendingRequestCard key={p.id} booking={p} />
            ))}
          </View>
        )}

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

const PendingRequestCard = ({ booking }: { booking: Booking }) => {
  const { mutate: accept, isPending: accepting } = useAcceptBooking();
  const { mutate: decline, isPending: declining } = useDeclineBooking();
  return (
    <Card>
      <View style={styles.requestHeader}>
        <Avatar uri={null} name={`User ${booking.customerId.slice(0, 4)}`} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.requestTitle}>New booking request</Text>
          <Text style={styles.requestMeta}>{formatDateTime(booking.slot.startIso)}</Text>
          <Text style={styles.requestMeta}>
            {minutesBetween(booking.slot.startIso, booking.slot.endIso)} min ·{' '}
            {booking.medium === 'video' ? 'Video' : 'Phone'} ·{' '}
            {formatCurrency(booking.priceCents)}
          </Text>
        </View>
        <Badge label="Requested" tone="warning" />
      </View>
      <View style={styles.requestActions}>
        <Button
          title="Accept"
          onPress={() =>
            accept(
              {
                id: booking.id,
                expertName: 'Customer',
                startIso: booking.slot.startIso,
                endIso: booking.slot.endIso,
              },
              {
                onSuccess: () => Toast.show({ type: 'success', text1: 'Booking confirmed' }),
                onError: (err) =>
                  Toast.show({
                    type: 'error',
                    text1: 'Could not accept',
                    text2: err instanceof Error ? err.message : 'Unknown error',
                  }),
              },
            )
          }
          loading={accepting}
          style={{ flex: 1 }}
        />
        <Button
          title="Decline"
          variant="ghost"
          onPress={() =>
            decline(
              { id: booking.id },
              {
                onSuccess: () => Toast.show({ type: 'success', text1: 'Booking declined' }),
                onError: (err) =>
                  Toast.show({
                    type: 'error',
                    text1: 'Could not decline',
                    text2: err instanceof Error ? err.message : 'Unknown error',
                  }),
              },
            )
          }
          loading={declining}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
};

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <Card style={{ flex: 1 }}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </Card>
);

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  statValue: { ...typography.title, color: colors.textPrimary, marginTop: 4 },
  muted: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  requestTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  requestMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
});
