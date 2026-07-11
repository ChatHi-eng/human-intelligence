import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { RatingStars } from '@/components/ui/RatingStars';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBooking, useCancelBooking } from '@/hooks/useBookings';
import { useExpert } from '@/hooks/useExperts';
import { formatDateTime, minutesBetween } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { createRoomForBooking, openCallRoom } from '@/services/video';
import type { BookingStatus } from '@/types/booking';

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

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: booking, isLoading } = useBooking(id);
  const { data: expert } = useExpert(booking?.expertId);
  const { mutate: cancel, isPending: cancelling } = useCancelBooking();

  const [stage, setStage] = useState<CallStage>('idle');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');

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

  const submitReview = () => {
    Toast.show({
      type: 'success',
      text1: 'Thanks for the review',
      text2: rating ? `You rated ${expert?.displayName ?? 'the expert'} ${rating}/5.` : '',
    });
    router.replace('/(tabs)/bookings');
  };

  const status = statusBadge(booking.status);
  const isCustomer = user?.id === booking.customerId;
  const isExpert = user?.id === booking.expertId;
  const canCancel =
    (isCustomer || isExpert) &&
    (booking.status === 'requested' || booking.status === 'confirmed');
  const canJoin = booking.status === 'confirmed' || booking.status === 'in_progress';

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
            <Text style={styles.label}>Paid</Text>
            <Text style={styles.value}>{formatCurrency(booking.priceCents)}</Text>
          </View>
        </Card>

        {booking.status === 'requested' && isCustomer && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Waiting for confirmation</Text>
            <Text style={styles.cardBody}>
              {(expert?.displayName ?? 'The expert') + ' has been notified. You\'ll get a confirmation as soon as they accept.'}
            </Text>
          </Card>
        )}

        {stage === 'review' ? (
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
            <Button title="Submit review" onPress={submitReview} disabled={!rating} />
          </Card>
        ) : canJoin ? (
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
              Cancelling now releases the time slot. Refunds get processed automatically once Stripe
              is wired up.
            </Text>
            <Button
              title="Cancel booking"
              variant="danger"
              loading={cancelling}
              onPress={() =>
                cancel(
                  { id: booking.id, reason: isExpert ? 'declined by expert' : 'cancelled by customer' },
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
