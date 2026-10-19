import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { BookingCard } from '@/components/booking/BookingCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useMyBookings } from '@/hooks/useBookings';
import { useExperts } from '@/hooks/useExperts';
import { isoDateKey } from '@/lib/date';

export default function ExpertCalendarScreen() {
  const { data: bookings } = useMyBookings();
  const { data: experts } = useExperts();
  const expertsById = new Map(experts?.map((e) => [e.id, e]) ?? []);
  const [selected, setSelected] = useState(isoDateKey(new Date().toISOString()));

  const marked = useMemo(() => {
    const m: Record<string, { marked: boolean; dotColor: string }> = {};
    (bookings ?? []).forEach((b) => {
      m[isoDateKey(b.slot.startIso)] = { marked: true, dotColor: colors.accent };
    });
    return m;
  }, [bookings]);

  const dayBookings = (bookings ?? []).filter((b) => isoDateKey(b.slot.startIso) === selected);

  return (
    <Screen padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.padded}>
          <SectionHeader title="Calendar" caption="Tap a day to see bookings." />
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
          <Text style={styles.sectionTitle}>Bookings on {selected}</Text>
          {dayBookings.length === 0 ? (
            <EmptyState
              title="No bookings this day"
              description="Open more availability to get booked."
              emoji="🗓️"
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {dayBookings.map((b) => (
                <BookingCard key={b.id} booking={b} expert={expertsById.get(b.expertId)} />
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
