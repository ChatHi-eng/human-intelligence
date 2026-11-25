import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { NotificationPrompt } from '@/components/account/NotificationPrompt';
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
import { BOOKING_WINDOW_DAYS } from '@/constants/business';
import { formatDateTime, isoDateKey, minutesBetween } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { noticeMinutesFor, sessionWindows } from '@/lib/discover';
import { copyExpertShareLink } from '@/lib/share';
import { generateSlots } from '@/lib/slots';
import { capture } from '@/services/analytics';
import type { DeclineReason } from '@/services/api';
import type { Booking } from '@/types/booking';

export default function StudioScreen() {
  const router = useRouter();
  const { data: expertProfile, isLoading: expertLoading } = useMyExpertProfile();
  const { data: pending = [] } = usePendingRequests();
  const { data: bookings } = useMyBookings();
  const { data: earnings } = useEarningsBuckets();

  if (expertLoading) return <LoadingView label="Loading Studio…" />;
  // Studio is only for experts. Non-experts get sent to the application wizard.
  if (!expertProfile) return <Redirect href="/expert-onboarding" />;

  // Supply-first: applicants see their review status instead of the workspace.
  // Availability, requests, and earnings only unlock once the owner approves.
  if (expertProfile.status === 'pending') {
    const firstName = expertProfile.displayName.split(' ')[0] ?? expertProfile.displayName;
    return (
      <Screen>
        <View style={styles.statusWrap}>
          <EmptyState
            title="Application under review"
            description={`Thanks for applying, ${firstName}. A person on our team reads every application, including your pitch, experience, LinkedIn, and resume. You'll hear back within 2 to 3 days. Once you're approved, your Studio unlocks with availability, bookings, and earnings.`}
            icon="clock"
          />
        </View>
      </Screen>
    );
  }
  if (expertProfile.status === 'rejected') {
    return (
      <Screen>
        <View style={styles.statusWrap}>
          <EmptyState
            title="We couldn't approve your application"
            description="Thanks for your interest in Palam. We weren't able to approve your application this time. If your situation changes, or you think we got it wrong, get in touch and we'll gladly take another look."
            icon="mail"
          />
        </View>
      </Screen>
    );
  }

  const today = isoDateKey(new Date().toISOString());
  const asExpert = (bookings ?? []).filter((b) => b.expertId === expertProfile.id);
  const todays = asExpert.filter(
    (b) => isoDateKey(b.slot.startIso) === today && b.status === 'confirmed',
  );
  // Everything booked and still to come, soonest first. With instant booking
  // a session lands here the moment a customer pays.
  const upcoming = asExpert
    .filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'in_progress') &&
        new Date(b.slot.endIso).getTime() > Date.now(),
    )
    .sort((a, b) => a.slot.startIso.localeCompare(b.slot.startIso));
  const weekly = earnings?.[1];
  const monthly = earnings?.[2];

  // What still stands between this expert and a first booking.
  const hasOpenTimes =
    generateSlots(sessionWindows(expertProfile), expertProfile.availabilityDates, [], {
      timeZone: expertProfile.timezone,
      minNoticeMinutes: noticeMinutesFor(expertProfile),
      daysAhead: BOOKING_WINDOW_DAYS,
    }).length > 0;
  const setupSteps = [
    {
      done: hasOpenTimes,
      title: 'Open your calendar',
      body: 'Customers can only book you once you add hours.',
      action: 'Set availability',
      href: '/studio/availability' as const,
    },
    {
      done: expertProfile.sessionPrice !== null,
      title: 'Set your session price',
      body: 'Your profile shows "Price coming soon" until you do.',
      action: 'Set price',
      href: '/studio/session-settings' as const,
    },
    {
      done: expertProfile.stripeConnectPayoutsEnabled,
      title: 'Connect payouts',
      body: 'So we can pay you after each session.',
      action: 'Set up payouts',
      href: '/studio/session-settings' as const,
    },
    {
      done: Boolean(expertProfile.avatarUrl),
      title: 'Add a photo',
      body: 'It is the first thing customers see.',
      action: 'Add photo',
      href: '/profile-edit' as const,
    },
  ];
  const openSteps = setupSteps.filter((s) => !s.done);

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

        <View style={{ marginBottom: spacing.lg }}>
          <NotificationPrompt
            title="Hear about bookings right away"
            body="Palam can tell you on this device when someone books or asks for a session, and remind you before each one starts."
          />
        </View>

        {/* Only approved experts reach this screen, so the link always resolves. */}
        <View style={styles.profileActions}>
          <Button
            title="View and edit profile"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/expert/[id]', params: { id: expertProfile.id } })
            }
            style={{ flex: 1 }}
          />
          <Button
            title="Share"
            variant="secondary"
            onPress={() => void copyExpertShareLink(expertProfile.id)}
          />
        </View>
        <Button
          title="Session settings: price and payouts"
          variant="ghost"
          onPress={() => router.push('/studio/session-settings')}
          style={styles.shareButton}
        />

        {expertProfile.pausedByPalam ? (
          <Card style={styles.setupCard}>
            <Text style={styles.cardTitle}>Palam has paused your profile</Text>
            <Text style={styles.cardCaption}>
              This follows repeated late cancellations (less than 24 hours to go) or missed
              sessions. You are hidden from Discover and cannot be booked. Sessions already
              booked still stand, and you are paid for them as usual.
            </Text>
            <Text style={styles.cardCaption}>
              A person at Palam looks at every pause. Write to info@palamapp.com and tell us
              what happened.
            </Text>
          </Card>
        ) : expertProfile.paused ? (
          <Card style={styles.setupCard}>
            <Text style={styles.cardTitle}>Your profile is paused</Text>
            <Text style={styles.cardCaption}>
              You are hidden from Discover and cannot be booked. Sessions already booked still
              stand.
            </Text>
            <Button
              title="Go to Availability to switch back on"
              variant="secondary"
              onPress={() => router.push('/studio/availability')}
            />
          </Card>
        ) : null}

        {openSteps.length > 0 ? (
          <Card style={styles.setupCard}>
            <Text style={styles.cardTitle}>Finish setting up</Text>
            <Text style={styles.cardCaption}>
              {setupSteps.length - openSteps.length} of {setupSteps.length} done
            </Text>
            {openSteps.map((step) => (
              <View key={step.title} style={styles.setupRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.setupTitle}>{step.title}</Text>
                  <Text style={styles.cardCaption}>{step.body}</Text>
                </View>
                <Button
                  title={step.action}
                  variant="secondary"
                  onPress={() => router.push(step.href)}
                />
              </View>
            ))}
          </Card>
        ) : null}

        <View style={styles.stats}>
          <StatCard
            label="Today"
            value={String(todays.length)}
            caption={todays.length === 1 ? 'call' : 'calls'}
          />
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

        {/* Instant-booking experts have no requests to answer, so the section
            only appears for approve-first experts or when something is waiting. */}
        {!expertProfile.autoAccept || pending.length > 0 ? (
          <SectionHeader
            title="Requests"
            caption="Answer within 24 hours. The customer is only charged if you accept."
          />
        ) : null}
        {expertProfile.autoAccept && pending.length === 0 ? null : pending.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="When a customer books, you'll see it here to accept or decline."
            icon="sun"
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {pending.map((p) => (
              <RequestCard key={p.id} booking={p} onOpen={() => router.push(`/booking/${p.id}`)} />
            ))}
          </View>
        )}

        <SectionHeader
          title="Upcoming sessions"
          caption="Who you're meeting, when, and what they want to talk about."
        />
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing booked yet"
            description="When a customer books you, the session shows up here."
            icon="calendar"
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {upcoming.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                expert={expertProfile}
                viewerIsExpert
                onPress={() => router.push(`/booking/${b.id}`)}
              />
            ))}
          </View>
        )}

        <SectionHeader title="Availability" caption="Weekly hours, extra dates and days off." />
        <Card>
          <Text style={styles.cardTitle}>Your calendar</Text>
          <Text style={styles.cardBody}>
            {hasOpenTimes
              ? 'Change your weekly hours, add extra dates, or take a day off.'
              : 'You have no open times, so customers cannot book you yet.'}
          </Text>
          <Button
            title="Manage availability"
            variant="secondary"
            onPress={() => router.push('/studio/availability')}
          />
          <Button
            title="View booking calendar"
            variant="ghost"
            onPress={() => router.push('/studio/calendar')}
            style={{ marginTop: spacing.sm }}
          />
        </Card>

        <SectionHeader title="Earnings" />
        <Card>
          <View style={styles.earningsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {monthly ? formatCurrency(monthly.payoutCents) : '—'}
              </Text>
              <Text style={styles.cardCaption}>
                This month • {monthly?.bookingCount ?? 0} booking
                {(monthly?.bookingCount ?? 0) === 1 ? '' : 's'}
              </Text>
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
  const [choosingReason, setChoosingReason] = useState(false);

  const onDecline = (declineReason?: DeclineReason) =>
    decline(
      { id: booking.id, declineReason },
      {
        onSuccess: () => {
          capture('booking_cancelled', { by_customer: false, decline_reason: declineReason ?? null });
          Toast.show({ type: 'success', text1: 'Declined', text2: 'The customer is not charged.' });
        },
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not decline',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );

  return (
    <Card>
      <View style={styles.requestHeader}>
        <Avatar
          uri={booking.customerAvatarUrl}
          name={booking.customerName ?? 'Customer'}
          size={40}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.requestTitle}>{booking.customerName ?? 'New booking request'}</Text>
          <Text style={styles.requestMeta}>{formatDateTime(booking.slot.startIso)}</Text>
          <Text style={styles.requestMeta}>
            {minutesBetween(booking.slot.startIso, booking.slot.endIso)} min ·{' '}
            {booking.medium === 'video' ? 'Video' : 'Phone'} ·{' '}
            {booking.kind === 'intro' ? 'Free intro' : formatCurrency(booking.priceCents)}
          </Text>
        </View>
        <Badge label="Requested" tone="warning" />
      </View>
      {booking.customerNote ? (
        <View style={styles.requestNote}>
          <Text style={styles.requestNoteLabel}>What they want to talk about</Text>
          <Text style={styles.requestNoteText}>{booking.customerNote}</Text>
        </View>
      ) : null}
      <View style={styles.requestActions}>
        <Button
          title="Accept"
          onPress={() =>
            accept(
              {
                id: booking.id,
                expertName: booking.customerName ?? 'your customer',
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
          onPress={() => setChoosingReason(true)}
          loading={declining}
          style={{ flex: 1 }}
        />
      </View>
      {choosingReason ? (
        <View style={styles.reasonBox}>
          <Text style={styles.requestNoteLabel}>Tell them why? (optional)</Text>
          <View style={styles.reasonRow}>
            {DECLINE_REASONS.map((r) => (
              <Pressable key={r.label} onPress={() => onDecline(r.value)} style={styles.reasonChip}>
                <Text style={styles.reasonText}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Keep the request" variant="ghost" onPress={() => setChoosingReason(false)} />
        </View>
      ) : null}
      <Button title="Open" variant="ghost" onPress={onOpen} style={{ marginTop: spacing.xs }} />
    </Card>
  );
};

// "The time doesn't work" makes the customer's email point at the expert's
// other open times; the rest only soften the wording.
const DECLINE_REASONS: { label: string; value?: DeclineReason }[] = [
  { label: "The time doesn't work", value: 'time' },
  { label: 'Not the right fit for me', value: 'not_a_fit' },
  { label: 'Something else', value: 'other' },
  { label: 'Decline without a reason' },
];

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
    <Text style={[styles.statLabel, highlight && { color: colors.accentInk }]}>{label}</Text>
    {/* A long amount ("$127.50", "$1,275.50") gets smaller type so it stays
        on one line in the narrow tile instead of breaking mid-number. */}
    <Text
      style={[
        styles.statValue,
        highlight && { color: colors.accentInk },
        value.length > 9
          ? { fontSize: 13 }
          : value.length > 7
            ? { fontSize: 15 }
            : value.length > 5
              ? { fontSize: 18 }
              : null,
      ]}
    >
      {value}
    </Text>
    {caption ? <Text style={styles.statCaption}>{caption}</Text> : null}
  </Card>
);

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  statusWrap: { flex: 1, justifyContent: 'center' },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroLabel: { ...typography.label, color: colors.textSecondary },
  heroTitle: { ...typography.title, color: colors.textPrimary },
  heroSubtitle: { ...typography.body, color: colors.textSecondary },
  shareButton: { marginBottom: spacing.lg },
  profileActions: { flexDirection: 'row', gap: spacing.sm },
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
  requestNote: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  requestNoteLabel: { ...typography.label, color: colors.textSecondary },
  requestNoteText: { ...typography.body, color: colors.textPrimary, marginTop: 2 },
  setupCard: { marginBottom: spacing.lg, gap: spacing.sm },
  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  setupTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  reasonBox: { marginTop: spacing.md, gap: spacing.sm },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  reasonText: { ...typography.bodyStrong, color: colors.textPrimary },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
});
