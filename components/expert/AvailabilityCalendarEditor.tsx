import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import Toast from 'react-native-toast-message';
import { formatMinutes } from '@/components/expert/AvailabilityEditor';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAddAvailabilityDate, useDeleteAvailabilityDate } from '@/hooks/useExperts';
import type { AvailabilityDate, AvailabilityWindow } from '@/types/user';

export type AvailabilityCalendarEditorProps = {
  dates: AvailabilityDate[];
  /** Weekly hours, so each date can show what already applies to it. */
  weekly?: AvailabilityWindow[];
};

const pad = (n: number) => n.toString().padStart(2, '0');

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// "2026-11-17" -> "Tuesday, Nov 17" without any time zone shifting.
const prettyDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
};

const weekdayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d).getDay() : -1;
};

export const AvailabilityCalendarEditor = ({ dates, weekly = [] }: AvailabilityCalendarEditorProps) => {
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [startMinute, setStartMinute] = useState(9 * 60);
  const [endMinute, setEndMinute] = useState(17 * 60);
  const { mutate: add, isPending: adding } = useAddAvailabilityDate();
  const { mutate: remove } = useDeleteAvailabilityDate();

  const marked = useMemo(() => {
    const m: Record<
      string,
      { marked: boolean; dotColor: string; selected?: boolean; selectedColor?: string }
    > = {};
    dates.forEach((d) => {
      const blockedAlready = m[d.date]?.dotColor === colors.danger;
      m[d.date] = {
        marked: true,
        dotColor: d.blocked || blockedAlready ? colors.danger : colors.accent,
      };
    });
    m[selectedDate] = {
      marked: m[selectedDate]?.marked ?? false,
      dotColor: m[selectedDate]?.dotColor ?? colors.accent,
      selected: true,
      selectedColor: colors.textPrimary,
    };
    return m;
  }, [dates, selectedDate]);

  const forDay = dates.filter((d) => d.date === selectedDate);
  const dayOff = forDay.find((d) => d.blocked);
  const extras = forDay.filter((d) => !d.blocked);
  const weeklyForDay = weekly
    .filter((w) => w.weekday === weekdayOf(selectedDate))
    .sort((a, b) => a.startMinute - b.startMinute);

  const onError = (text1: string) => (err: unknown) =>
    Toast.show({
      type: 'error',
      text1,
      text2: err instanceof Error ? err.message : 'Unknown error',
    });

  const onAdd = () => {
    if (endMinute <= startMinute) {
      Toast.show({ type: 'error', text1: 'End time must be after start' });
      return;
    }
    add({ date: selectedDate, startMinute, endMinute }, { onError: onError('Could not add') });
  };

  const onTakeDayOff = () =>
    add(
      { date: selectedDate, startMinute: 0, endMinute: 1440, blocked: true },
      {
        onSuccess: () => Toast.show({ type: 'success', text1: 'Day marked as off' }),
        onError: onError('Could not save'),
      },
    );

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.caption}>
        Pick a date to add extra hours or take the day off. Extra hours are added to your weekly
        hours. A day off cancels all your hours for that date. Sessions already booked stay booked.
      </Text>
      <Calendar
        markedDates={marked}
        onDayPress={(d: DateData) => setSelectedDate(d.dateString)}
        minDate={todayKey()}
        theme={{
          todayTextColor: colors.accent,
          selectedDayBackgroundColor: colors.textPrimary,
          selectedDayTextColor: '#fff',
          arrowColor: colors.textPrimary,
          textDayFontWeight: '500',
          textMonthFontWeight: '700',
        }}
      />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{prettyDate(selectedDate)}</Text>

        {dayOff ? (
          <>
            <View style={styles.entryRow}>
              <Text style={[styles.entryText, { color: colors.danger }]}>Day off</Text>
              <Pressable onPress={() => remove(dayOff.id)} hitSlop={12}>
                <Text style={styles.removeText}>Undo</Text>
              </Pressable>
            </View>
            <Text style={styles.empty}>Customers cannot book you on this date.</Text>
          </>
        ) : (
          <>
            <Text style={styles.empty}>
              {weeklyForDay.length > 0
                ? `Weekly hours: ${weeklyForDay
                    .map((w) => `${formatMinutes(w.startMinute)} to ${formatMinutes(w.endMinute)}`)
                    .join(', ')}`
                : 'No weekly hours on this day.'}
            </Text>
            {extras.map((d) => (
              <View key={d.id} style={styles.entryRow}>
                <Text style={styles.entryText}>
                  Extra: {formatMinutes(d.startMinute)} to {formatMinutes(d.endMinute)}
                </Text>
                <Pressable onPress={() => remove(d.id)} hitSlop={12}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.timeRow}>
              <TimeStepper
                label="Start"
                value={startMinute}
                onAdjust={(delta) => setStartMinute((m) => Math.max(0, Math.min(1410, m + delta)))}
              />
              <TimeStepper
                label="End"
                value={endMinute}
                onAdjust={(delta) => setEndMinute((m) => Math.max(30, Math.min(1440, m + delta)))}
              />
            </View>
            <Button title="Add extra hours" variant="secondary" onPress={onAdd} loading={adding} />
            <Button title="Take this day off" variant="ghost" onPress={onTakeDayOff} />
          </>
        )}
      </View>
    </View>
  );
};

const TimeStepper = ({
  label,
  value,
  onAdjust,
}: {
  label: string;
  value: number;
  onAdjust: (delta: number) => void;
}) => (
  <View style={{ flex: 1, gap: spacing.xs }}>
    <Text style={styles.stepperLabel}>{label}</Text>
    <View style={styles.stepper}>
      <Pressable onPress={() => onAdjust(-30)} hitSlop={8} accessibilityLabel={`${label} earlier`}>
        <Text style={styles.stepperButton}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{formatMinutes(value)}</Text>
      <Pressable onPress={() => onAdjust(30)} hitSlop={8} accessibilityLabel={`${label} later`}>
        <Text style={styles.stepperButton}>+</Text>
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  caption: { ...typography.caption, color: colors.textSecondary },
  panel: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  panelTitle: { ...typography.heading, color: colors.textPrimary },
  empty: { ...typography.body, color: colors.textMuted },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  entryText: { ...typography.bodyStrong, color: colors.textPrimary },
  removeText: { ...typography.bodyStrong, color: colors.danger },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  stepperLabel: { ...typography.label, color: colors.textSecondary },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
  },
  stepperButton: { ...typography.heading, color: colors.textPrimary, paddingHorizontal: spacing.sm },
  stepperValue: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center' },
});
