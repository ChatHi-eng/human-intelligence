import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { BookingCard } from '@/components/booking/BookingCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useMyBookings } from '@/hooks/useBookings';
import { useAuth } from '@/hooks/useAuth';
import { formatDay, isoDateKey } from '@/lib/date';

export default function ExpertCalendarScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: allBookings } = useMyBookings();
  // This is the expert's calendar: sessions booked with them that are still
  // on, not sessions they booked with someone else.
  const bookings = useMemo(
    () =>
      (allBookings ?? []).filter((b) => b.expertId === user?.id && b.status !== 'cancelled'),
    [allBookings, user?.id],
  );
  const [selected, setSelected] = useState(isoDateKey(new Date().toISOString()));

  const marked = useMemo(() => {
    const m: Record<string, { marked: boolean; dotColor: string }> = {};
    bookings.forEach((b) => {
      m[isoDateKey(b.slot.startIso)] = { marked: true, dotColor: colors.accent };
    });
    return m;
  }, [bookings]);

  const dayBookings = bookings
    .filter((b) => isoDateKey(b.slot.startIso) === selected)
    .sort((a, b) => a.slot.startIso.localeCompare(b.slot.startIso));

  return (
    <Screen padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.padded}>
          <SectionHeader
            level="page"
            title="Calendar"
            caption="Tap a day to see who you're meeting."
          />
        </View>
        <Calendar
          markedDates={{ ...marked, [selected]: { ...marked[selected], selected: true } }}
          onDayPress={(d: DateData) => setSelected(d.dateString)}
          theme={{
            todayTextColor: colors.accent,
            selectedDayBackgroundColor: colors.textPrimary,
            selectedDayTextColor: '#fff',
            arrowColor: colors.textPrimary,
            textDayFontWeight: '500',
            textMonthFontWeight: '700',
          }}
        />
        <View style={styles.padded}>
          <Text style={styles.sectionTitle}>{formatDay(`${selected}T12:00:00`)}</Text>
          {dayBookings.length === 0 ? (
            <EmptyState
              title="No bookings this day"
              description="Open more availability to get booked."
              icon="calendar"
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {dayBookings.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  expert={undefined}
                  viewerIsExpert
                  onPress={() => router.push(`/booking/${b.id}`)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.lg },
});
