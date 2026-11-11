import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
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
import { useMyReviewForBooking, useSubmitReview } from '@/hooks/useReviews';
import { formatDateTime, minutesBetween } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { isFreeCancellation, isWithinNoShowReportWindow } from '@/lib/policy';
import { createRoomForBooking, openCallRoom } from '@/services/video';
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
  }
};

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: booking, isLoading } = useBooking(id);
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

  if (isLoading && !booking) return <LoadingView label="Loading booking…" />;
  if (!booking) {
    return (
      <Screen>
        <EmptyState title="Booking not found" emoji="🤷" />
      </Screen>
    );
  }

  const handleJoin = async () => {
    setStage('connecting');
    try {
      // Use the persisted URL if we have one. Otherwise mint a fresh one (the
      // booking flow may have skipped minting due to a transient Daily error).
      const room = booking.callRoomUrl
        ? { url: booking.callRoomUrl, name: '' }
        : await createRoomForBooking(booking.id);
      // openBrowserAsync returns quickly once the browser has actually opened.
      // We don't await the entire call session — the user can navigate back
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
  const needsPayment = isCustomer && bookingActive && paymentIncomplete;
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
  const reportWindowOpen = isWithinNoShowReportWindow(booking.slot.startIso);
  const reportableStatus =
    booking.status === 'confirmed' ||
    booking.status === 'in_progress' ||
    booking.status === 'completed';
  const canReportNoShow =
    (isCustomer || isExpert) && reportableStatus && reportWindowOpen && !booking.noShowReportedAt;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Card>
          <View style={styles.headerRow}>
            <Avatar uri={expert?.avatarUrl} name={expert?.displayName ?? '?'} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{expert?.displayName ?? 'Expert'}</Text>
              <Text style={styles.meta}>{formatDateTime(booking.slot.startIso)}</Text>
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
                paymentIncomplete && { color: colors.danger },
                booking.paymentStatus === 'refunded' && { color: colors.textMuted },
              ]}
            >
              {formatCurrency(booking.priceCents)} · {paymentLabel(booking.paymentStatus)}
            </Text>
          </View>
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

        {booking.status === 'requested' && isCustomer && !needsPayment && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Payment received</Text>
            <Text style={styles.cardBody}>
              {(expert?.displayName ?? 'The expert') +
                " has been notified. You'll get a confirmation as soon as they accept — and a full refund if they can't make it."}
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
        ) : canJoin && !callOver ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>
              {booking.medium === 'video' ? 'Join the video call' : 'Start the phone call'}
            </Text>
            <Text style={styles.cardBody}>
              {booking.medium === 'video'
                ? 'Opens the Daily.co room in your browser. Allow camera + mic when prompted.'
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

        {canCancel && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Need to cancel?</Text>
            <Text style={styles.cardBody}>
              {isExpert
                ? 'Cancelling releases the time slot and refunds the customer in full — their plans are in your hands, so please only cancel when you really have to.'
                : 'Cancelling is free until 24 hours before your session — after that, the payment stays with the expert.'}
            </Text>
            {forfeitsPayment && (
              <Text style={styles.policyWarning}>
                Less than 24 hours to go — cancelling now isn&apos;t refunded under Palam&apos;s
                policy.
              </Text>
            )}
            <Button
              title={forfeitsPayment ? 'Cancel anyway — no refund' : 'Cancel booking'}
              variant="danger"
              loading={cancelling}
              onPress={() =>
                cancel(
                  {
                    id: booking.id,
                    reason: isExpert
                      ? 'declined by expert'
                      : forfeitsPayment
                        ? 'cancelled by customer inside 24h — payment forfeited per policy'
                        : 'cancelled by customer',
                    // Inside 24h the customer forfeits the payment — don't
                    // attempt a refund (the server would refuse it anyway).
                    refund: !forfeitsPayment,
                  },
                  {
                    onSuccess: () => {
                      Toast.show({ type: 'success', text1: 'Booking cancelled' });
                      router.replace('/(tabs)/bookings');
                    },
                    onError: (err) =>
                      Toast.show({
                        type: 'error',
                        text1: 'Could not cancel',
                        text2: err instanceof Error ? err.message : 'Unknown error',
                      }),
                  },
                )
              }
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
      </ScrollView>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  label: { ...typography.body, color: colors.textSecondary },
  value: { ...typography.bodyStrong, color: colors.textPrimary },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  cardBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  policyWarning: { ...typography.bodyStrong, color: colors.danger, marginBottom: spacing.md },
  noShowLink: { marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.sm },
  noShowLinkText: { ...typography.body, color: colors.textMuted },
  reviewInput: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
});
