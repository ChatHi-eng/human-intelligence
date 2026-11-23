import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { NotificationPrompt } from '@/components/account/NotificationPrompt';
import { CancelSheet } from '@/components/booking/CancelSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { RatingStars } from '@/components/ui/RatingStars';
import { Screen } from '@/components/ui/Screen';
import { MESSAGING_ENABLED } from '@/constants/featureFlags';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  useBooking,
  useCancelBooking,
  useCompletePayment,
  useReportNoShow,
} from '@/hooks/useBookings';
import { useExpert } from '@/hooks/useExperts';
import { useOpenConversation } from '@/hooks/useMessages';
import { useAppConfig } from '@/hooks/useNotificationPrefs';
import {
  usePendingReschedule,
  useRespondToReschedule,
  useWithdrawReschedule,
} from '@/hooks/useReschedule';
import { useMyReviewForBooking, useSubmitReview } from '@/hooks/useReviews';
import { formatDateTime, minutesBetween } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { cancelPrompt } from '@/lib/cancelCopy';
import { isFreeCancellation, isWithinNoShowReportWindow } from '@/lib/policy';
import { capture } from '@/services/analytics';
import { DEFAULT_APP_CONFIG, fetchMyLateCancellationCount } from '@/services/api';
import { createRoomForBooking, joinCall, openCallRoom } from '@/services/video';
import type { BookingStatus, PaymentStatus } from '@/types/booking';

type CallStage = 'idle' | 'connecting' | 'in-call' | 'review';

const statusBadge = (status: BookingStatus): { label: string; tone: BadgeTone } => {
  switch (status) {
    case 'requested':
      return { label: 'Awaiting expert', tone: 'warning' };
    case 'confirmed':
      return { label: 'Confirmed', tone: 'accent' };
    case 'in_progress':
      return { label: 'In progress', tone: 'success' };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'warning' };
  }
};

const paymentLabel = (status: PaymentStatus): string => {
  switch (status) {
    case 'pending':
      return 'Not paid yet';
    case 'authorized':
      return 'Payment held';
    case 'captured':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    case 'failed':
      return 'Payment failed';
    case 'released':
      return 'Not charged';
    case 'not_required':
      return 'Free';
  }
};

export default function BookingDetailScreen() {
  const { id, stripe, review } = useLocalSearchParams<{
    id: string;
    stripe?: string;
    review?: string;
  }>();
  // Arriving from "How was your session?" (?review=1): bring the review card
  // into view instead of leaving it below the fold.
  const scrollRef = useRef<ScrollView>(null);
  const showedReview = useRef(false);
  const router = useRouter();
  const { user } = useAuth();
  const { data: booking, isLoading, refetch } = useBooking(id);
  const { data: expert } = useExpert(booking?.expertId);
  const { mutate: cancel, isPending: cancelling } = useCancelBooking();
  const { mutate: completePayment, isPending: paying } = useCompletePayment();
  const { mutate: reportNoShow, isPending: reporting } = useReportNoShow();
  const { data: myReview } = useMyReviewForBooking(id);
  const { mutate: submitReview, isPending: submittingReview } = useSubmitReview();
  const { mutate: openConversation, isPending: openingChat } = useOpenConversation();

  const [stage, setStage] = useState<CallStage>('idle');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);
  // Nothing is cancelled on the first tap: a sheet says what will happen.
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  // Only an expert about to cancel a confirmed session late needs their count.
  const expertCancellingLate =
    Boolean(user?.id) &&
    user?.id === booking?.expertId &&
    booking?.status === 'confirmed' &&
    !isFreeCancellation(booking.slot.startIso);
  const { data: config = DEFAULT_APP_CONFIG } = useAppConfig();
  const { data: lateCancellations } = useQuery({
    queryKey: ['late-cancellations', user?.id, config.lateCancelWindowDays],
    queryFn: () => fetchMyLateCancellationCount(user?.id ?? '', config.lateCancelWindowDays),
    enabled: expertCancellingLate,
  });
  // An expert's suggestion of new times, waiting on the customer.
  const { data: proposal } = usePendingReschedule(id, booking?.status === 'confirmed');
  const { mutate: answerProposal, isPending: answering } = useRespondToReschedule(id);
  const { mutate: withdrawProposal, isPending: withdrawing } = useWithdrawReschedule(id);

  // Back from Stripe on the web (?stripe=success): the payment lands a few
  // seconds after the page does, so check often for half a minute before
  // deciding it did not go through.
  const [confirmWindowOpen, setConfirmWindowOpen] = useState(stripe === 'success');
  const confirmingPayment = confirmWindowOpen && booking?.paymentStatus === 'pending';
  useEffect(() => {
    if (!confirmingPayment) return;
    const poll = setInterval(() => void refetch(), 2000);
    const giveUp = setTimeout(() => setConfirmWindowOpen(false), 30_000);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [confirmingPayment, refetch]);

  if (isLoading && !booking) return <LoadingView label="Loading booking…" />;
  if (!booking) {
    return (
      <Screen>
        <EmptyState title="Booking not found" icon="help-circle" />
      </Screen>
    );
  }

  const handleJoin = async () => {
    setStage('connecting');
    try {
      // With the room's address already in hand, open it at once (a browser
      // only allows a new tab straight after the tap) and tell Palam in the
      // background that this person went in. Otherwise ask for the room,
      // which records it too.
      let url = booking.callRoomUrl;
      if (url) {
        void joinCall(booking.id).catch(() => undefined);
      } else {
        const joined = await joinCall(booking.id).catch(() => null);
        url =
          joined?.status === 'ok' ? joined.url : (await createRoomForBooking(booking.id)).url;
      }
      const room = { url };
      capture('call_joined', { via: 'booking' });
      // openBrowserAsync returns quickly once the browser has actually opened.
      // We don't await the entire call session, the user can navigate back
      // any time and hit 'Review the call' when finished.
      await openCallRoom(room.url);
      setStage('review');
    } catch (err) {
      setStage('idle');
      Toast.show({
        type: 'error',
        text1: 'Could not start call',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const onSubmitReview = () => {
    if (!rating) return;
    submitReview(
      {
        bookingId: booking.id,
        expertId: booking.expertId,
        bookingStatus: booking.status,
        rating,
        comment: comment.trim() || null,
      },
      {
        onSuccess: () => {
          setStage('idle');
          Toast.show({
            type: 'success',
            text1: 'Thanks for the review',
            text2: `You rated ${expert?.displayName ?? 'the expert'} ${rating}/5.`,
          });
        },
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not save review',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  const status = statusBadge(booking.status);
  const isCustomer = user?.id === booking.customerId;
  const isExpert = user?.id === booking.expertId;
  const canCancel =
    (isCustomer || isExpert) &&
    (booking.status === 'requested' || booking.status === 'confirmed');
  const canJoin = booking.status === 'confirmed' || booking.status === 'in_progress';
  const bookingActive = booking.status === 'requested' || booking.status === 'confirmed';
  const paymentIncomplete =
    booking.paymentStatus === 'pending' || booking.paymentStatus === 'failed';
  const needsPayment = isCustomer && bookingActive && paymentIncomplete && !confirmingPayment;
  // A request the expert has not answered yet: taking it back costs nothing.
  const withdrawable =
    isCustomer &&
    booking.status === 'requested' &&
    (booking.paymentStatus === 'authorized' || booking.kind === 'intro');
  const callOver = new Date(booking.slot.endIso).getTime() < Date.now();
  // Customers can review after the call: right when they hang up (stage
  // 'review'), or any time after the slot has passed on a non-cancelled booking.
  const reviewEligible =
    isCustomer &&
    !myReview &&
    booking.status !== 'cancelled' &&
    (stage === 'review' || booking.status === 'completed' || (canJoin && callOver));

  // Cancellation policy: free until 24h before the start. Inside 24h a
  // customer can still cancel but forfeits the payment; the expert cancelling
  // always refunds the customer (the Edge Function enforces the same rule).
  const freeCancel = isFreeCancellation(booking.slot.startIso);
  const forfeitsPayment = isCustomer && !freeCancel && booking.paymentStatus === 'captured';
  // No-show reports: either party, from start+10min to start+72h, once.
  // An expert cancelling a confirmed session this late gets it on their record.
  const expertLate = isExpert && booking.status === 'confirmed' && !freeCancel;
  // Moving the booking instead: a confirmed session that has not started
  // and has moves left. A customer can do it until 24 hours before.
  const notStarted = new Date(booking.slot.startIso).getTime() > Date.now();
  const movesLeft = config.maxReschedules - booking.rescheduleCount;
  const movable =
    (isCustomer || isExpert) && booking.status === 'confirmed' && notStarted && movesLeft > 0;
  const canMove = movable && (isExpert || freeCancel);
  const openReschedule = () => {
    setCancelSheetOpen(false);
    router.push({ pathname: '/reschedule/[id]', params: { id: booking.id } });
  };
  const otherPerson = isExpert
    ? (booking.customerName ?? 'the customer')
    : (expert?.displayName ?? 'the expert');
  const onAnswer = (choiceIso: string | null) => {
    if (!proposal) return;
    answerProposal(
      { proposalId: proposal.id, choiceIso },
      {
        onSuccess: () =>
          Toast.show(
            choiceIso
              ? { type: 'success', text1: 'Your booking is moved', text2: formatDateTime(choiceIso) }
              : { type: 'success', text1: 'Keeping the original time' },
          ),
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not save your answer',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };
  const cancelCopy = cancelPrompt({
    role: isExpert ? 'expert' : 'customer',
    status: booking.status,
    kind: booking.kind === 'intro' ? 'intro' : 'session',
    paymentStatus: booking.paymentStatus,
    priceCents: booking.priceCents,
    startIso: booking.slot.startIso,
    otherName: isExpert ? (booking.customerName ?? null) : (expert?.displayName ?? null),
    freeCancel,
    lateCancellations: lateCancellations ?? null,
    pauseRule: { count: config.lateCancelPauseCount, days: config.lateCancelWindowDays },
    canMoveInstead: canMove,
  });
  const runCancel = () =>
    cancel(
      {
        id: booking.id,
        reason: isExpert
          ? 'declined by expert'
          : forfeitsPayment
            ? 'cancelled by customer inside 24h, payment forfeited per policy'
            : 'cancelled by customer',
        // Inside 24h the customer forfeits the payment, don't attempt a
        // refund (the server would refuse it anyway).
        refund: !forfeitsPayment,
        byExpert: isExpert,
      },
      {
        onSuccess: () => {
          capture('booking_cancelled', { by_customer: isCustomer, late: expertLate || forfeitsPayment });
          setCancelSheetOpen(false);
          Toast.show({
            type: 'success',
            text1: withdrawable ? 'Request withdrawn' : 'Booking cancelled',
          });
          router.replace('/(tabs)/bookings');
        },
        onError: (err) => {
          setCancelSheetOpen(false);
          Toast.show({
            type: 'error',
            text1: 'Could not cancel',
            text2: err instanceof Error ? err.message : 'Unknown error',
          });
        },
      },
    );
  const reportWindowOpen = isWithinNoShowReportWindow(booking.slot.startIso);
  const reportableStatus =
    booking.status === 'confirmed' ||
    booking.status === 'in_progress' ||
    booking.status === 'completed';
  const canReportNoShow =
    (isCustomer || isExpert) && reportableStatus && reportWindowOpen && !booking.noShowReportedAt;

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Card>
          <View style={styles.headerRow}>
            <Avatar
              uri={isExpert ? booking.customerAvatarUrl : expert?.avatarUrl}
              name={isExpert ? (booking.customerName ?? 'Customer') : (expert?.displayName ?? '?')}
              size={56}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {isExpert ? (booking.customerName ?? 'Customer') : (expert?.displayName ?? 'Expert')}
              </Text>
              <Text style={styles.meta}>{formatDateTime(booking.slot.startIso)}</Text>
              {booking.previousStartIso && booking.status !== 'cancelled' ? (
                <Text style={styles.movedFrom}>
                  Moved from {formatDateTime(booking.previousStartIso)}
                </Text>
              ) : null}
            </View>
            <Badge label={status.label} tone={status.tone} />
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Length</Text>
            <Text style={styles.value}>
              {minutesBetween(booking.slot.startIso, booking.slot.endIso)} min
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Medium</Text>
            <Text style={styles.value}>{booking.medium === 'video' ? 'Video' : 'Phone'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Payment</Text>
            <Text
              style={[
                styles.value,
                paymentIncomplete && !confirmingPayment && { color: colors.danger },
                booking.paymentStatus === 'refunded' && { color: colors.textMuted },
              ]}
            >
              {booking.kind === 'intro'
                ? 'Free intro call'
                : `${formatCurrency(booking.priceCents)} · ${
                    confirmingPayment ? 'Confirming' : paymentLabel(booking.paymentStatus)
                  }`}
            </Text>
          </View>
          {booking.customerNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.label}>
                {isExpert ? 'What they want to talk about' : 'What you asked about'}
              </Text>
              <Text style={styles.noteText}>{booking.customerNote}</Text>
            </View>
          ) : null}
          {MESSAGING_ENABLED && (
          <Button
            title={isExpert ? 'Message customer' : `Message ${expert?.displayName ?? 'expert'}`}
            variant="secondary"
            loading={openingChat}
            onPress={() =>
              openConversation(
                { customerId: booking.customerId, expertId: booking.expertId },
                {
                  onSuccess: (conversationId) =>
                    router.push({ pathname: '/chat/[id]', params: { id: conversationId } }),
                  onError: (err) =>
                    Toast.show({
                      type: 'error',
                      text1: 'Could not open chat',
                      text2: err instanceof Error ? err.message : 'Unknown error',
                    }),
                },
              )
            }
            style={{ marginTop: spacing.md }}
          />
          )}
        </Card>

        {isCustomer && proposal && proposal.options.length > 0 && booking.status === 'confirmed' ? (
          <Card style={styles.proposalCard}>
            <Text style={styles.sectionTitle}>
              {otherPerson} asked to move this {booking.kind === 'intro' ? 'intro call' : 'session'}
            </Text>
            <Text style={styles.cardBody}>
              Pick a time that works, or keep the one you have. Nothing changes unless you pick
              one, and it costs nothing to move.
            </Text>
            <View style={styles.proposalOptions}>
              {proposal.options.map((option) => (
                <Button
                  key={option}
                  title={formatDateTime(option)}
                  variant="secondary"
                  disabled={answering}
                  onPress={() => onAnswer(option)}
                />
              ))}
              <Button
                title="Keep the original time"
                variant="ghost"
                loading={answering}
                onPress={() => onAnswer(null)}
              />
            </View>
          </Card>
        ) : null}

        {bookingActive && (isCustomer || isExpert) && !needsPayment && !confirmingPayment ? (
          <View style={{ marginTop: spacing.lg }}>
            <NotificationPrompt
              title="Get a reminder before it starts"
              body={
                booking.status === 'requested' && isCustomer
                  ? 'Palam can tell you on this device the moment your request is answered, and remind you before the session starts.'
                  : 'Palam can remind you on this device a day before, an hour before and ten minutes before the start.'
              }
            />
          </View>
        ) : null}

        {confirmingPayment && isCustomer && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Confirming your payment</Text>
            <Text style={[styles.cardBody, { marginBottom: 0 }]}>
              This takes a few seconds. Stay on this page and it will update on its own.
            </Text>
          </Card>
        )}

        {needsPayment && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Finish your payment</Text>
            <Text style={styles.cardBody}>
              Your time slot is being held, but the payment didn&apos;t go through. Complete it to
              lock in the session.
            </Text>
            <Button
              title={paying ? 'Opening Stripe…' : 'Complete payment'}
              onPress={() =>
                completePayment(booking.id, {
                  onError: (err) =>
                    Toast.show({
                      type: 'error',
                      text1: 'Could not open payment',
                      text2: err instanceof Error ? err.message : 'Unknown error',
                    }),
                })
              }
              loading={paying}
            />
          </Card>
        )}

        {booking.status === 'requested' &&
          isCustomer &&
          (!paymentIncomplete || booking.kind === 'intro') && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>
              {booking.paymentStatus === 'authorized' || booking.kind === 'intro'
                ? 'Request sent'
                : 'Payment received'}
            </Text>
            <Text style={styles.cardBody}>
              {booking.kind === 'intro'
                ? (expert?.displayName ?? 'The expert') + ' has 24 hours to answer.'
                : booking.paymentStatus === 'authorized'
                ? (expert?.displayName ?? 'The expert') +
                  ' has 24 hours to answer. Your card is on hold and is only charged if they accept.'
                : (expert?.displayName ?? 'The expert') +
                  " has been notified. You'll get a confirmation as soon as they accept, and a full refund if they can't make it."}
            </Text>
          </Card>
        )}

        {myReview && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Your review</Text>
            <View style={{ marginVertical: spacing.sm }}>
              <RatingStars value={myReview.rating} size={20} />
            </View>
            {myReview.comment ? <Text style={styles.cardBody}>{myReview.comment}</Text> : null}
          </Card>
        )}

        {reviewEligible ? (
          <View
            onLayout={(event) => {
              if (review !== '1' || showedReview.current) return;
              showedReview.current = true;
              scrollRef.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false });
            }}
          >
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>How was your call?</Text>
            <View style={{ marginVertical: spacing.md }}>
              <RatingStars value={rating ?? 0} interactive onChange={setRating} size={28} />
            </View>
            <TextInput
              placeholder="What stood out? (optional)"
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              style={styles.reviewInput}
            />
            <Button
              title="Submit review"
              onPress={onSubmitReview}
              disabled={!rating}
              loading={submittingReview}
            />
          </Card>
          </View>
        ) : canJoin && !callOver ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>
              {booking.medium === 'video' ? 'Join the video call' : 'Start the phone call'}
            </Text>
            <Text style={styles.cardBody}>
              {booking.medium === 'video'
                ? 'Opens your video room. Allow the camera and microphone when asked.'
                : 'Phone calls open via your device dialer (coming with the dev build).'}
            </Text>
            <Button
              title={
                stage === 'connecting'
                  ? 'Opening room…'
                  : stage === 'in-call'
                    ? 'In call'
                    : 'Join call'
              }
              onPress={handleJoin}
              loading={stage === 'connecting'}
              disabled={stage === 'in-call'}
            />
          </Card>
        ) : null}

        {(isCustomer || isExpert) && booking.status === 'confirmed' && notStarted ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>
              {isExpert ? "Can't make this time?" : 'Need a different time?'}
            </Text>
            {movesLeft <= 0 ? (
              <Text style={[styles.cardBody, { marginBottom: 0 }]}>
                A booking can be moved {config.maxReschedules} times, and this one has been.
              </Text>
            ) : isExpert && proposal && proposal.options.length > 0 ? (
              <>
                <Text style={styles.cardBody}>
                  You suggested {proposal.options.length === 1 ? 'a new time' : 'new times'}.{' '}
                  {otherPerson} has not answered yet, so the session stays where it is for now.
                </Text>
                {proposal.options.map((option) => (
                  <Text key={option} style={styles.proposalTime}>
                    {formatDateTime(option)}
                  </Text>
                ))}
                <View style={styles.proposalOptions}>
                  <Button
                    title="Suggest different times"
                    variant="secondary"
                    onPress={openReschedule}
                  />
                  <Button
                    title="Take my suggestion back"
                    variant="ghost"
                    loading={withdrawing}
                    onPress={() =>
                      withdrawProposal(proposal.id, {
                        onSuccess: () =>
                          Toast.show({ type: 'success', text1: 'Suggestion taken back' }),
                        onError: (err) =>
                          Toast.show({
                            type: 'error',
                            text1: 'Could not take it back',
                            text2: err instanceof Error ? err.message : 'Unknown error',
                          }),
                      })
                    }
                  />
                </View>
              </>
            ) : isExpert ? (
              <>
                <Text style={styles.cardBody}>
                  Suggest up to three other times instead of cancelling. If {otherPerson} picks
                  one, the session moves and nothing goes on your record.
                </Text>
                <Button title="Suggest a new time" variant="secondary" onPress={openReschedule} />
              </>
            ) : freeCancel ? (
              <>
                <Text style={styles.cardBody}>
                  Move it to another of {otherPerson}&apos;s open times. It&apos;s free until 24
                  hours before the start, and you keep the same booking and payment.
                </Text>
                <Button title="Change time" variant="secondary" onPress={openReschedule} />
              </>
            ) : (
              <Text style={[styles.cardBody, { marginBottom: 0 }]}>
                The time can be changed until 24 hours before the start, so it&apos;s too late to
                move this one yourself. If {otherPerson} suggests a new time, you can accept it
                here.
              </Text>
            )}
          </Card>
        ) : null}

        {canCancel && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>
              {withdrawable ? 'Changed your mind?' : 'Need to cancel?'}
            </Text>
            <Text style={styles.cardBody}>
              {isExpert
                ? 'Cancelling releases the time slot and refunds the customer in full. Their plans are in your hands, so please only cancel when you really have to.'
                : withdrawable
                  ? `You can take this request back any time before ${expert?.displayName ?? 'the expert'} answers. You pay nothing.`
                  : 'Cancelling is free until 24 hours before your session. After that, the payment stays with the expert.'}
            </Text>
            {forfeitsPayment && (
              <Text style={styles.policyWarning}>
                Less than 24 hours to go. Cancelling now isn&apos;t refunded under Palam&apos;s
                policy.
              </Text>
            )}
            {expertLate && (
              <Text style={styles.policyWarning}>
                Less than 24 hours to go. Cancelling now counts as a late cancellation on your
                record.
              </Text>
            )}
            <Button
              title={
                forfeitsPayment
                  ? 'Cancel anyway (no refund)'
                  : withdrawable
                    ? 'Withdraw request'
                    : 'Cancel booking'
              }
              variant="dangerQuiet"
              onPress={() => setCancelSheetOpen(true)}
            />
          </Card>
        )}

        {booking.noShowReportedAt ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Report received</Text>
            <Text style={[styles.cardBody, { marginBottom: 0 }]}>
              A human reviews every report within 48 hours. If a refund is due, it goes back to
              the original payment method automatically.
            </Text>
          </Card>
        ) : canReportNoShow && !confirmingNoShow ? (
          <Pressable onPress={() => setConfirmingNoShow(true)} style={styles.noShowLink}>
            <Text style={styles.noShowLinkText}>Didn&apos;t happen? Report a no-show</Text>
          </Pressable>
        ) : canReportNoShow && confirmingNoShow ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Report a no-show</Text>
            <Text style={styles.cardBody}>
              {isCustomer
                ? `You're reporting that ${expert?.displayName ?? 'the expert'} didn't join this session. A human reviews every report within 48 hours.`
                : "You're reporting that the customer didn't join this session. A human reviews every report within 48 hours."}
            </Text>
            <Button
              title="Send report"
              variant="danger"
              loading={reporting}
              onPress={() =>
                reportNoShow(booking.id, {
                  onSuccess: () => {
                    setConfirmingNoShow(false);
                    Toast.show({
                      type: 'success',
                      text1: 'Report received',
                      text2: 'A human reviews every one within 48 hours.',
                    });
                  },
                  onError: (err) =>
                    Toast.show({
                      type: 'error',
                      text1: 'Could not send report',
                      text2: err instanceof Error ? err.message : 'Unknown error',
                    }),
                })
              }
            />
            <Button
              title="Never mind"
              variant="secondary"
              onPress={() => setConfirmingNoShow(false)}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        ) : null}

        {/* Opened straight from a link (back from Stripe, or from an email):
            there is no previous screen, so give a way to the bookings list. */}
        {!router.canGoBack() && (
          <Button
            title="Go to your bookings"
            variant="ghost"
            onPress={() => router.replace('/(tabs)/bookings')}
            style={{ marginTop: spacing.lg }}
          />
        )}
      </ScrollView>
      <CancelSheet
        visible={cancelSheetOpen}
        copy={cancelCopy}
        working={cancelling}
        onKeep={() => setCancelSheetOpen(false)}
        onConfirm={runCancel}
        onMove={openReschedule}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  name: { ...typography.heading, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  label: { ...typography.body, color: colors.textSecondary },
  value: { ...typography.bodyStrong, color: colors.textPrimary },
  noteBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  noteText: { ...typography.body, color: colors.textPrimary, marginTop: 2 },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  cardBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  policyWarning: { ...typography.bodyStrong, color: colors.danger, marginBottom: spacing.md },
  movedFrom: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  proposalCard: { marginTop: spacing.lg, borderColor: colors.accent },
  proposalOptions: { gap: spacing.sm },
  proposalTime: { ...typography.bodyStrong, color: colors.textPrimary, marginBottom: spacing.xs },
  noShowLink: { marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.sm },
  noShowLinkText: { ...typography.body, color: colors.textMuted },
  reviewInput: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
});
