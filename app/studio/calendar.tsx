import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { BookingCard } from '@/components/booking/BookingCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useMyBookings } from '@/hooks/useBookings';
import { useExperts } from '@/hooks/useExperts';
import { isoDateKey } from '@/lib/date';
import { connectGoogleCalendar } from '@/services/calendar';

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
              description="Open more availability or sync your Google Calendar."
              emoji="🗓️"
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {dayBookings.map((b) => (
                <BookingCard key={b.id} booking={b} expert={expertsById.get(b.expertId)} />
              ))}
            </View>
          )}
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.cardTitle}>Sync with Google Calendar</Text>
            <Text style={styles.cardBody}>
              Two-way sync will mirror bookings with your Google calendar. Currently stubbed.
            </Text>
            <Button
              title="Connect Google Calendar"
              variant="secondary"
              onPress={() => void connectGoogleCalendar()}
            />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.lg },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, marginBottom: spacing.xs },
  cardBody: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
});
