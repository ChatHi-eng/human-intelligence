import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { formatTime } from '@/lib/date';
import { deviceTimeZone, type GeneratedSlot } from '@/lib/slots';

export type SlotPickerProps = {
  // Open times, grouped by the viewer's calendar day (lib/slots.ts).
  slotsByDate: Record<string, GeneratedSlot[]>;
  // Start times currently chosen.
  selected: string[];
  onPress: (slot: GeneratedSlot) => void;
};

const dayChipLabel = (dateKey: string): { weekday: string; day: string } => {
  const d = new Date(`${dateKey}T12:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
};

// A row of days, then that day's times. One time or several can be chosen:
// the screen using it decides what a tap means. Used for moving a booking;
// it looks and reads the same as the picker on the booking screen.
export const SlotPicker = ({ slotsByDate, selected, onPress }: SlotPickerProps) => {
  const dateKeys = Object.keys(slotsByDate).sort();
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const activeDate = chosenDate && slotsByDate[chosenDate] ? chosenDate : (dateKeys[0] ?? null);
  const times = activeDate ? (slotsByDate[activeDate] ?? []) : [];
  const zone = deviceTimeZone();

  return (
    <View>
      <Text style={styles.label}>Pick a day</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayRow}
      >
        {dateKeys.map((dateKey) => {
          const { weekday, day } = dayChipLabel(dateKey);
          const active = dateKey === activeDate;
          const daySlots = slotsByDate[dateKey] ?? [];
          const picked = daySlots.filter((s) => selected.includes(s.startIso)).length;
          return (
            <Pressable
              key={dateKey}
              onPress={() => setChosenDate(dateKey)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.dayChip, active && styles.dayChipActive]}
            >
              <Text style={[styles.dayWeekday, active && styles.dayTextActive]}>{weekday}</Text>
              <Text style={[styles.dayDate, active && styles.dayTextActive]}>{day}</Text>
              <Text style={[styles.dayCount, active && styles.dayTextActive]}>
                {picked > 0
                  ? `${picked} picked`
                  : `${daySlots.length} ${daySlots.length === 1 ? 'time' : 'times'}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Pick a time</Text>
      <Text style={styles.zoneNote}>
        {zone
          ? `Times are shown in your time zone (${zone}).`
          : 'Times are shown in your local time.'}
      </Text>
      <View style={styles.timeGrid}>
        {times.map((slot) => {
          const active = selected.includes(slot.startIso);
          return (
            <Pressable
              key={slot.startIso}
              onPress={() => onPress(slot)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.timeChip, active && styles.timeChipActive]}
            >
              <Text style={[styles.timeText, active && styles.timeTextActive]}>
                {formatTime(slot.startIso)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
  zoneNote: { ...typography.caption, color: colors.textMuted },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
  timeChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  timeChipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  timeText: { ...typography.bodyStrong, color: colors.textPrimary },
  timeTextActive: { color: '#FFFFFF' },
});
