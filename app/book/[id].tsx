import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { PaymentSheet } from '@/components/booking/PaymentSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useCreateBooking, useExpertActiveBookings } from '@/hooks/useBookings';
import { useExpert } from '@/hooks/useExperts';
import { formatTime } from '@/lib/date';
import { generateSlots, groupSlotsByDate } from '@/lib/slots';
import type { CallMedium, TimeSlot } from '@/types/booking';

const dayChipLabel = (dateKey: string): { weekday: string; day: string } => {
  const d = new Date(`${dateKey}T12:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
};

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: expert, isLoading } = useExpert(id);
  const { data: busy } = useExpertActiveBookings(id);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [medium, setMedium] = useState<CallMedium>('video');
  const { mutate: book, isPending } = useCreateBooking();

  const slotsByDate = useMemo(() => {
    if (!expert) return {};
    return groupSlotsByDate(
      generateSlots(expert.availability, expert.availabilityDates, busy ?? []),
    );
  }, [expert, busy]);

  const dateKeys = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);
  const activeDate = selectedDate ?? dateKeys[0] ?? null;
  const timesForDay = activeDate ? (slotsByDate[activeDate] ?? []) : [];

  if (isLoading && !expert) return <LoadingView label="Loading…" />;
  if (!expert) {
    return (
      <Screen>
        <EmptyState title="Expert not found" emoji="🤷" />
      </Screen>
    );
  }

  const onConfirm = () => {
    if (!selectedSlot) {
      Toast.show({ type: 'error', text1: 'Pick a time first' });
      return;
    }
    book(
      { expertId: expert.id, slot: selectedSlot, medium },
      {
        onSuccess: (result) => {
          if (result.checkoutResult === 'cancel') {
            Toast.show({ type: 'error', text1: 'Payment not completed' });
          }
          router.replace(`/booking/${result.bookingId}`);
        },
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not book',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.expertRow}>
          <Avatar uri={expert.avatarUrl} name={expert.displayName} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.expertName}>{expert.displayName}</Text>
            <Text style={styles.expertMeta}>30-minute session</Text>
          </View>
        </View>

        {dateKeys.length === 0 ? (
          <EmptyState
            title="No times available"
            description={`${expert.displayName} hasn't opened up their calendar yet. Check back soon.`}
            emoji="📅"
          />
        ) : (
          <>
            <Text style={styles.label}>Pick a day</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {dateKeys.map((dateKey) => {
                const { weekday, day } = dayChipLabel(dateKey);
                const active = dateKey === activeDate;
                const count = slotsByDate[dateKey]?.length ?? 0;
                return (
                  <Pressable
                    key={dateKey}
                    onPress={() => {
                      setSelectedDate(dateKey);
                      setSelectedSlot(null);
                    }}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                  >
                    <Text style={[styles.dayWeekday, active && styles.dayTextActive]}>
                      {weekday}
                    </Text>
                    <Text style={[styles.dayDate, active && styles.dayTextActive]}>{day}</Text>
                    <Text style={[styles.dayCount, active && styles.dayTextActive]}>
                      {count} {count === 1 ? 'time' : 'times'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Pick a time</Text>
            <View style={styles.timeGrid}>
              {timesForDay.map((slot) => {
                const active = selectedSlot?.startIso === slot.startIso;
                return (
                  <Pressable
                    key={slot.startIso}
                    onPress={() => setSelectedSlot(slot)}
                    style={[styles.timeChip, active && styles.timeChipActive]}
                  >
                    <Text style={[styles.timeText, active && styles.timeTextActive]}>
                      {formatTime(slot.startIso)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>How would you like to talk?</Text>
            <View style={styles.mediumRow}>
              <Button
                title="Video"
                variant={medium === 'video' ? 'primary' : 'secondary'}
                onPress={() => setMedium('video')}
                style={{ flex: 1 }}
              />
              <Button
                title="Phone"
                variant={medium === 'phone' ? 'primary' : 'secondary'}
                onPress={() => setMedium('phone')}
                style={{ flex: 1 }}
              />
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <PaymentSheet
                amountCents={expert.hourlyRate}
                expertName={expert.displayName}
                onPay={onConfirm}
                loading={isPending}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  expertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  expertName: { ...typography.heading, color: colors.textPrimary },
  expertMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.lg },
  dayRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  dayChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    minWidth: 84,
  },
  dayChipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  dayWeekday: { ...typography.label, color: colors.textSecondary },
  dayDate: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: 2 },
  dayCount: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  dayTextActive: { color: '#FFFFFF' },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  timeChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  timeChipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  timeText: { ...typography.bodyStrong, color: colors.textPrimary },
  timeTextActive: { color: '#FFFFFF' },
  mediumRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },
});
