import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  useAddAvailabilityDate,
  useDeleteAvailabilityDate,
} from '@/hooks/useExperts';
import type { AvailabilityDate } from '@/types/user';

export type AvailabilityCalendarEditorProps = {
  dates: AvailabilityDate[];
};

const fmt = (m: number) => {
  const hr = Math.floor(m / 60);
  const min = m % 60;
  const period = hr >= 12 ? 'pm' : 'am';
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:${min.toString().padStart(2, '0')}${period}`;
};

const todayKey = () => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const AvailabilityCalendarEditor = ({ dates }: AvailabilityCalendarEditorProps) => {
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [startMinute, setStartMinute] = useState(9 * 60);
  const [endMinute, setEndMinute] = useState(17 * 60);
  const { mutate: add, isPending: adding } = useAddAvailabilityDate();
  const { mutate: remove } = useDeleteAvailabilityDate();

  const marked = useMemo(() => {
    const m: Record<string, { marked: boolean; dotColor: string; selected?: boolean; selectedColor?: string }> =
      {};
    dates.forEach((d) => {
      m[d.date] = { marked: true, dotColor: colors.accent };
    });
    m[selectedDate] = {
      ...m[selectedDate],
      marked: m[selectedDate]?.marked ?? false,
      dotColor: m[selectedDate]?.dotColor ?? colors.accent,
      selected: true,
      selectedColor: colors.textPrimary,
    };
    return m;
  }, [dates, selectedDate]);

  const todays = dates.filter((d) => d.date === selectedDate);

  const onAdd = () => {
    if (endMinute <= startMinute) {
      Toast.show({ type: 'error', text1: 'End time must be after start' });
      return;
    }
    add(
      { date: selectedDate, startMinute, endMinute },
      {
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not add',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.caption}>
        Tap a date to override your weekly hours. Specific-date windows add to your weekly availability.
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
        <Text style={styles.panelTitle}>{selectedDate}</Text>

        {todays.length === 0 ? (
          <Text style={styles.empty}>No windows yet — add one below.</Text>
        ) : (
          todays.map((d) => (
            <View key={d.id} style={styles.entryRow}>
              <Text style={styles.entryText}>
                {fmt(d.startMinute)} – {fmt(d.endMinute)}
              </Text>
              <Pressable onPress={() => remove(d.id)} hitSlop={12}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))
        )}

        <View style={styles.timeRow}>
          <TimeStepper
            label="Start"
            value={startMinute}
            onAdjust={(delta) => setStartMinute((m) => Math.max(0, Math.min(1439, m + delta)))}
          />
          <TimeStepper
            label="End"
            value={endMinute}
            onAdjust={(delta) => setEndMinute((m) => Math.max(1, Math.min(1440, m + delta)))}
          />
        </View>
        <Button title="Add window" variant="secondary" onPress={onAdd} loading={adding} />
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
      <Pressable onPress={() => onAdjust(-30)} hitSlop={8}>
        <Text style={styles.stepperButton}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{fmt(value)}</Text>
      <Pressable onPress={() => onAdjust(30)} hitSlop={8}>
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
  stepperButton: {
    ...typography.heading,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
  },
  stepperValue: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center' },
});
