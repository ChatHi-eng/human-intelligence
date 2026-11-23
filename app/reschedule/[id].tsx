import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { SlotPicker } from '@/components/booking/SlotPicker';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { BOOKING_WINDOW_DAYS } from '@/constants/business';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBooking, useExpertBusyTimes } from '@/hooks/useBookings';
import { useExpert } from '@/hooks/useExperts';
import { useAppConfig } from '@/hooks/useNotificationPrefs';
import { useProposeReschedule, useRescheduleBooking } from '@/hooks/useReschedule';
import { formatDateTime, minutesBetween } from '@/lib/date';
import { introWindows, noticeMinutesFor, sessionWindows } from '@/lib/discover';
import { isFreeCancellation } from '@/lib/policy';
import { generateSlots, groupSlotsByDate, type GeneratedSlot } from '@/lib/slots';
import { DEFAULT_APP_CONFIG } from '@/services/api';

// How many times an expert can offer at once.
const MAX_SUGGESTIONS = 3;
// An expert knows their own day, so they can offer times sooner than the
// notice they ask of new customers.
const EXPERT_NOTICE_MINUTES = 60;

// Moving a booking instead of cancelling it.
//
//   Customer: picks one of the expert's open times and the booking moves,
//             free, until 24 hours before the start.
//   Expert:   picks up to three of their open times to offer. Nothing moves
//             unless the customer accepts one.
//
// The database enforces every rule (migration 0032); this screen only offers
// what it will accept.
export default function RescheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: booking, isLoading } = useBooking(id);
  const { data: expert } = useExpert(booking?.expertId);
  const { data: busy } = useExpertBusyTimes(booking?.expertId);
  const { data: config = DEFAULT_APP_CONFIG } = useAppConfig();
  const { mutate: move, isPending: moving } = useRescheduleBooking(id);
  const { mutate: suggest, isPending: suggesting } = useProposeReschedule(id);
  const [selected, setSelected] = useState<string[]>([]);

  const isExpert = Boolean(user?.id) && user?.id === booking?.expertId;
  const isCustomer = Boolean(user?.id) && user?.id === booking?.customerId;

  const slotsByDate = useMemo(() => {
    if (!expert || !booking) return {};
    const isIntro = booking.kind === 'intro';
    // The booking's own time does not block its neighbours, and is not
    // offered back.
    const taken = (busy ?? []).filter((b) => b.startIso !== booking.slot.startIso);
    const slots = generateSlots(
      isIntro ? introWindows(expert) : sessionWindows(expert),
      isIntro ? expert.availabilityDates.filter((d) => d.blocked) : expert.availabilityDates,
      taken,
      {
        slotMinutes: minutesBetween(booking.slot.startIso, booking.slot.endIso),
        timeZone: expert.timezone,
        bufferMinutes: expert.bufferMinutes,
        minNoticeMinutes: isExpert ? EXPERT_NOTICE_MINUTES : noticeMinutesFor(expert),
        daysAhead: BOOKING_WINDOW_DAYS,
      },
    ).filter((s) => s.startIso !== booking.slot.startIso);
    return groupSlotsByDate(slots);
  }, [expert, booking, busy, isExpert]);

  if (isLoading && !booking) return <LoadingView label="Loading…" />;
  if (!booking || (!isExpert && !isCustomer)) {
    return (
      <Screen>
        <EmptyState title="Booking not found" icon="help-circle" />
      </Screen>
    );
  }

  // Back to the booking this was opened from, not a second copy of it. Opened
  // from a link with nothing behind it, go to the booking fresh.
  const backToBooking = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
  };
  const blocked = (title: string, description: string) => (
    <Screen>
      <View style={styles.blocked}>
        <EmptyState title={title} description={description} icon="calendar" />
        <Button title="Back to the booking" variant="secondary" onPress={backToBooking} />
      </View>
    </Screen>
  );

  const started = new Date(booking.slot.startIso).getTime() <= Date.now();
  if (booking.status !== 'confirmed' || started) {
    return blocked(
      'This booking cannot be moved',
      'Only a confirmed session that has not started yet can have its time changed.',
    );
  }
  if (booking.rescheduleCount >= config.maxReschedules) {
    return blocked(
      'This booking has reached its limit',
      `A booking can be moved ${config.maxReschedules} times, and this one has been.`,
    );
  }
  if (isCustomer && !isFreeCancellation(booking.slot.startIso)) {
    return blocked(
      'It is too late to move this one',
      'The time can be changed until 24 hours before the start.',
    );
  }
  if (!expert) return <LoadingView label="Loading open times…" />;

  const otherName = isExpert ? (booking.customerName ?? 'your customer') : expert.displayName;
  const what = booking.kind === 'intro' ? 'intro call' : 'session';
  const hasTimes = Object.keys(slotsByDate).length > 0;

  const onPress = (slot: GeneratedSlot) => {
    if (!isExpert) {
      setSelected([slot.startIso]);
      return;
    }
    setSelected((current) => {
      if (current.includes(slot.startIso)) return current.filter((s) => s !== slot.startIso);
      if (current.length >= MAX_SUGGESTIONS) {
        Toast.show({ type: 'info', text1: `You can suggest up to ${MAX_SUGGESTIONS} times` });
        return current;
      }
      return [...current, slot.startIso].sort();
    });
  };

  const onError = (err: unknown) =>
    Toast.show({
      type: 'error',
      text1: isExpert ? 'Could not send your suggestion' : 'Could not move the booking',
      text2: err instanceof Error ? err.message : 'Unknown error',
    });

  const onConfirm = () => {
    const first = selected[0];
    if (!first) return;
    if (isExpert) {
      suggest(selected, {
        onSuccess: () => {
          Toast.show({
            type: 'success',
            text1: `Sent to ${otherName}`,
            text2: 'The session stays where it is unless they pick a new time.',
          });
          backToBooking();
        },
        onError,
      });
      return;
    }
    move(first, {
      onSuccess: () => {
        Toast.show({
          type: 'success',
          text1: 'Your booking is moved',
          text2: formatDateTime(first),
        });
        backToBooking();
      },
      onError,
    });
  };

  const first = selected[0];
  const confirmTitle = isExpert
    ? selected.length === 0
      ? `Send to ${otherName}`
      : `Send ${selected.length} ${selected.length === 1 ? 'time' : 'times'} to ${otherName}`
    : first
      ? `Move to ${formatDateTime(first)}`
      : 'Move my booking';

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{isExpert ? 'Suggest a new time' : 'Pick a new time'}</Text>
        <Text style={styles.body}>
          {isExpert
            ? `Choose up to ${MAX_SUGGESTIONS} times you can do. ${otherName} picks one, or keeps the time they have. Nothing moves unless they pick, and a move they accept never counts against you.`
            : `Choose another of ${otherName}'s open times. It costs nothing, and you keep the same booking and payment.`}
        </Text>
        <View style={styles.current}>
          <Text style={styles.currentLabel}>Your {what} is now</Text>
          <Text style={styles.currentTime}>{formatDateTime(booking.slot.startIso)}</Text>
        </View>

        {hasTimes ? (
          <>
            <SlotPicker slotsByDate={slotsByDate} selected={selected} onPress={onPress} />
            <Button
              title={confirmTitle}
              onPress={onConfirm}
              disabled={selected.length === 0}
              loading={moving || suggesting}
              style={styles.confirm}
            />
            <Button title="Keep the time I have" variant="ghost" onPress={backToBooking} />
          </>
        ) : (
          <View style={styles.blocked}>
            <EmptyState
              title="No other open times"
              description={
                isExpert
                  ? `You have no other open times in the next ${BOOKING_WINDOW_DAYS} days. Add hours under Studio, Availability, then come back.`
                  : `${otherName} has no other open times in the next ${BOOKING_WINDOW_DAYS} days.`
              }
              icon="calendar"
            />
            <Button title="Back to the booking" variant="secondary" onPress={backToBooking} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  current: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  currentLabel: { ...typography.label, color: colors.textSecondary },
  currentTime: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: 2 },
  confirm: { marginTop: spacing.xl },
  blocked: { paddingTop: spacing.xl, gap: spacing.lg },
});
