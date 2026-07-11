import { Redirect, useRouter } from 'expo-router';
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
import { useMyExpertProfile } from '@/hooks/useExperts';
import { formatDateTime, isoDateKey, minutesBetween } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import type { Booking } from '@/types/booking';

export default function StudioScreen() {
  const router = useRouter();
  const { data: expertProfile, isLoading: expertLoading } = useMyExpertProfile();
  const { data: pending = [] } = usePendingRequests();
  const { data: bookings } = useMyBookings();
  const { data: earnings } = useEarningsBuckets();

  if (expertLoading) return <LoadingView label="Loading Studio…" />;
  // Studio is only for experts. Non-experts get sent to the setup screen.
  if (!expertProfile) return <Redirect href="/expert-profile-edit" />;

  const today = isoDateKey(new Date().toISOString());
  const asExpert = (bookings ?? []).filter((b) => b.expertId === expertProfile.id);
  const todays = asExpert.filter(
    (b) => isoDateKey(b.slot.startIso) === today && b.status === 'confirmed',
  );
  const weekly = earnings?.[1];
  const monthly = earnings?.[2];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Your practice</Text>
            <Text style={styles.heroTitle}>{expertProfile.displayName}</Text>
            <Text style={styles.heroSubtitle}>{expertProfile.headline}</Text>
          </View>
          <Avatar
            uri={expertProfile.avatarUrl ?? expertProfile.coverImageUrl}
            name={expertProfile.displayName}
            size={64}
          />
        </View>

        <View style={styles.stats}>
          <StatCard label="Today" value={String(todays.length)} caption={todays.length === 1 ? 'call' : 'calls'} />
          <StatCard
            label="Requests"
            value={String(pending.length)}
            caption="awaiting"
            highlight={pending.length > 0}
          />
          <StatCard
            label="This week"
            value={weekly ? formatCurrency(weekly.payoutCents) : '—'}
            caption="paid out"
          />
        </View>

        <SectionHeader title="Requests" caption="Customers waiting for you to confirm." />
        {pending.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="When a customer books, you'll see it here to accept or decline."
            emoji="🌤️"
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {pending.map((p) => (
              <RequestCard key={p.id} booking={p} onOpen={() => router.push(`/booking/${p.id}`)} />
            ))}
          </View>
        )}

        <SectionHeader title="Today's calls" />
        {todays.length === 0 ? (
          <EmptyState
            title="No calls today"
            description="Enjoy the breather — or open up more availability."
            emoji="☕"
          />
        ) : (
          todays.map((b) => (
            <BookingCard key={b.id} booking={b} expert={expertProfile} onPress={() => router.push(`/booking/${b.id}`)} />
          ))
        )}

        <SectionHeader title="Availability" caption="Recurring weekly hours + one-off dates." />
        <Card>
          <Text style={styles.cardTitle}>Your calendar</Text>
          <Text style={styles.cardBody}>
            Manage recurring weekly hours and specific-date availability. New slots become bookable
            immediately.
          </Text>
          <Button
            title="Manage availability"
            variant="secondary"
            onPress={() => router.push('/studio/calendar')}
          />
        </Card>

        <SectionHeader title="Earnings" />
        <Card>
          <View style={styles.earningsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{monthly ? formatCurrency(monthly.payoutCents) : '—'}</Text>
              <Text style={styles.cardCaption}>This month • {monthly?.bookingCount ?? 0} bookings</Text>
            </View>
            <Button
              title="View breakdown"
              variant="secondary"
              onPress={() => router.push('/studio/earnings')}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const RequestCard = ({ booking, onOpen }: { booking: Booking; onOpen: () => void }) => {
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
                onSuccess: () => Toast.show({ type: 'success', text1: 'Declined' }),
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
      <Button title="Open" variant="ghost" onPress={onOpen} style={{ marginTop: spacing.xs }} />
    </Card>
  );
};

const StatCard = ({
  label,
  value,
  caption,
  highlight,
}: {
  label: string;
  value: string;
  caption?: string;
  highlight?: boolean;
}) => (
  <Card style={{ flex: 1 }}>
    <Text style={[styles.statLabel, highlight && { color: colors.accent }]}>{label}</Text>
    <Text style={[styles.statValue, highlight && { color: colors.accent }]}>{value}</Text>
    {caption ? <Text style={styles.statCaption}>{caption}</Text> : null}
  </Card>
);

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  heroLabel: { ...typography.label, color: colors.textSecondary },
  heroTitle: { ...typography.title, color: colors.textPrimary },
  heroSubtitle: { ...typography.body, color: colors.textSecondary },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  statValue: { ...typography.title, color: colors.textPrimary, marginTop: 4 },
  statCaption: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardCaption: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cardBody: { ...typography.body, color: colors.textSecondary, marginVertical: spacing.sm },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  requestTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  requestMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
});
