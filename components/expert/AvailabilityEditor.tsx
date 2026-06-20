import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSetAvailability } from '@/hooks/useExperts';
import type { AvailabilityWindow } from '@/types/user';

export type AvailabilityEditorProps = {
  initial: AvailabilityWindow[];
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const defaultWindow: AvailabilityWindow = {
  weekday: 1,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
};

const fmt = (m: number) => {
  const hr = Math.floor(m / 60);
  const min = m % 60;
  const period = hr >= 12 ? 'pm' : 'am';
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:${min.toString().padStart(2, '0')}${period}`;
};

export const AvailabilityEditor = ({ initial }: AvailabilityEditorProps) => {
  const [windows, setWindows] = useState<AvailabilityWindow[]>(initial);
  const { mutate: save, isPending: saving } = useSetAvailability();

  useEffect(() => {
    setWindows(initial);
  }, [initial]);

  const addWindow = () =>
    setWindows((ws) =>
      [...ws, defaultWindow].sort((a, b) =>
        a.weekday !== b.weekday ? a.weekday - b.weekday : a.startMinute - b.startMinute,
      ),
    );

  const removeWindow = (idx: number) =>
    setWindows((ws) => ws.filter((_, i) => i !== idx));

  const cycleWeekday = (idx: number) =>
    setWindows((ws) =>
      ws.map((w, i) =>
        i === idx ? { ...w, weekday: (((w.weekday + 1) % 7) as AvailabilityWindow['weekday']) } : w,
      ),
    );

  const adjust = (idx: number, field: 'startMinute' | 'endMinute', delta: number) =>
    setWindows((ws) =>
      ws.map((w, i) => {
        if (i !== idx) return w;
        const next = Math.max(0, Math.min(1440, w[field] + delta));
        const updated = { ...w, [field]: next };
        if (updated.endMinute <= updated.startMinute) return w; // ignore invalid
        return updated;
      }),
    );

  const onSave = () => {
    save(windows, {
      onSuccess: () => Toast.show({ type: 'success', text1: 'Availability saved' }),
      onError: (err) =>
        Toast.show({
          type: 'error',
          text1: 'Could not save',
          text2: err instanceof Error ? err.message : 'Unknown error',
        }),
    });
  };

  return (
    <View style={{ gap: spacing.md }}>
      {windows.length === 0 ? (
        <Text style={styles.empty}>No availability set — customers won&apos;t see any times.</Text>
      ) : (
        windows.map((w, idx) => (
          <View key={idx} style={styles.row}>
            <Pressable onPress={() => cycleWeekday(idx)} style={styles.dayChip}>
              <Text style={styles.dayText}>{WEEKDAYS[w.weekday]}</Text>
            </Pressable>
            <TimeStepper
              value={w.startMinute}
              onAdjust={(delta) => adjust(idx, 'startMinute', delta)}
            />
            <Text style={styles.dash}>–</Text>
            <TimeStepper
              value={w.endMinute}
              onAdjust={(delta) => adjust(idx, 'endMinute', delta)}
            />
            <Pressable onPress={() => removeWindow(idx)} hitSlop={12}>
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))
      )}
      <Button title="Add window" variant="secondary" onPress={addWindow} />
      <Button title="Save availability" onPress={onSave} loading={saving} />
    </View>
  );
};

const TimeStepper = ({ value, onAdjust }: { value: number; onAdjust: (delta: number) => void }) => (
  <View style={styles.stepper}>
    <Pressable onPress={() => onAdjust(-30)} hitSlop={8}>
      <Text style={styles.stepperButton}>−</Text>
    </Pressable>
    <Text style={styles.stepperValue}>{fmt(value)}</Text>
    <Pressable onPress={() => onAdjust(30)} hitSlop={8}>
      <Text style={styles.stepperButton}>+</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    minWidth: 56,
    alignItems: 'center',
  },
  dayText: { ...typography.bodyStrong, color: colors.textPrimary },
  dash: { ...typography.body, color: colors.textMuted },
  removeText: { ...typography.heading, color: colors.danger, paddingHorizontal: spacing.sm },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepperButton: {
    ...typography.heading,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
  },
  stepperValue: { ...typography.bodyStrong, color: colors.textPrimary, minWidth: 60, textAlign: 'center' },
});
