import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useSetAvailability } from '@/hooks/useExperts';
import { deviceTimeZone, normalizeWindows } from '@/lib/slots';
import { INTRO_MINUTES, SESSION_MINUTES } from '@/constants/business';
import type { AvailabilityKind, AvailabilityWindow } from '@/types/user';

export type AvailabilityEditorProps = {
  /** The windows of this kind only. */
  initial: AvailabilityWindow[];
  /** Paid-session hours (default) or free-intro hours. */
  kind?: AvailabilityKind;
  /** The zone the saved hours were written in, if any. */
  savedTimeZone?: string | null;
};

type Weekday = AvailabilityWindow['weekday'];

// Monday first: that is how people plan a working week.
const DAYS: { weekday: Weekday; label: string }[] = [
  { weekday: 1, label: 'Monday' },
  { weekday: 2, label: 'Tuesday' },
  { weekday: 3, label: 'Wednesday' },
  { weekday: 4, label: 'Thursday' },
  { weekday: 5, label: 'Friday' },
  { weekday: 6, label: 'Saturday' },
  { weekday: 0, label: 'Sunday' },
];
const WORKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export const formatMinutes = (m: number) => {
  const hr = Math.floor(m / 60) % 24;
  const min = m % 60;
  const period = hr >= 12 ? 'pm' : 'am';
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:${min.toString().padStart(2, '0')}${period}`;
};

const serialize = (ws: AvailabilityWindow[]) =>
  normalizeWindows(ws)
    .map((w) => `${w.weekday}:${w.startMinute}-${w.endMinute}`)
    .join('|');

export const AvailabilityEditor = ({
  initial,
  savedTimeZone,
  kind = 'session',
}: AvailabilityEditorProps) => {
  const intro = kind === 'intro';
  const [windows, setWindows] = useState<AvailabilityWindow[]>(initial);
  const { mutate: save, isPending: saving } = useSetAvailability();
  const zone = deviceTimeZone();

  useEffect(() => {
    setWindows(initial);
  }, [initial]);

  const dirty = useMemo(() => serialize(windows) !== serialize(initial), [windows, initial]);
  // Saving also records the zone, so hours typed in another zone need a save.
  const zoneChanged = Boolean(zone && savedTimeZone && zone !== savedTimeZone);
  const zoneMissing = Boolean(zone && !savedTimeZone && initial.length > 0);

  const totalMinutes = normalizeWindows(windows).reduce(
    (sum, w) => sum + (w.endMinute - w.startMinute),
    0,
  );

  const addWindow = (weekday: Weekday) =>
    setWindows((ws) => {
      const day = ws.filter((w) => w.weekday === weekday);
      const lastEnd = day.reduce((max, w) => Math.max(max, w.endMinute), 0);
      // First block of a day is 9 to 5 (noon to 1 for free intros); a second
      // block starts an hour after the last one ends, when there is room.
      const firstStart = intro ? 12 * 60 : 9 * 60;
      const firstEnd = intro ? 13 * 60 : 17 * 60;
      const start = day.length === 0 ? firstStart : Math.min(lastEnd + 60, 22 * 60);
      const end = day.length === 0 ? firstEnd : Math.min(start + (intro ? 60 : 120), 24 * 60);
      if (end <= start) return ws;
      return [...ws, { weekday, startMinute: start, endMinute: end, kind }];
    });

  const removeWindow = (target: AvailabilityWindow) =>
    setWindows((ws) => ws.filter((w) => w !== target));

  const adjust = (target: AvailabilityWindow, field: 'startMinute' | 'endMinute', delta: number) =>
    setWindows((ws) =>
      ws.map((w) => {
        if (w !== target) return w;
        const next = Math.max(0, Math.min(1440, w[field] + delta));
        const updated = { ...w, [field]: next };
        if (updated.endMinute <= updated.startMinute || updated.startMinute > 1439) return w;
        return updated;
      }),
    );

  const copyToWorkdays = (weekday: Weekday) =>
    setWindows((ws) => {
      const source = ws.filter((w) => w.weekday === weekday);
      const others = ws.filter((w) => !WORKDAYS.includes(w.weekday) || w.weekday === weekday);
      const copies = WORKDAYS.filter((d) => d !== weekday).flatMap((d) =>
        source.map((w) => ({ ...w, weekday: d })),
      );
      return [...others, ...copies];
    });

  const setWorkdayPreset = () =>
    setWindows((ws) => [
      ...ws.filter((w) => !WORKDAYS.includes(w.weekday)),
      ...WORKDAYS.map((weekday) => ({
        weekday,
        startMinute: intro ? 12 * 60 : 9 * 60,
        endMinute: intro ? 13 * 60 : 17 * 60,
        kind,
      })),
    ]);

  const onSave = () => {
    const cleaned = normalizeWindows(windows);
    save(
      { windows: cleaned, kind },
      {
      onSuccess: () => {
        setWindows(cleaned);
        Toast.show({ type: 'success', text1: intro ? 'Intro hours saved' : 'Weekly hours saved' });
      },
      onError: (err) =>
        Toast.show({
          type: 'error',
          text1: 'Could not save',
          text2: err instanceof Error ? err.message : 'Unknown error',
        }),
      },
    );
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.caption}>
        {zone
          ? `These hours repeat every week, in your time (${zone}). Customers see them converted to their own time zone.`
          : 'These hours repeat every week.'}
      </Text>
      {zoneChanged ? (
        <Text style={styles.notice}>
          Your saved hours were set in {savedTimeZone}. Save again to switch them to {zone}.
        </Text>
      ) : null}

      <View style={styles.quickRow}>
        <Pressable onPress={setWorkdayPreset} style={styles.quickChip}>
          <Text style={styles.quickText}>
            {intro ? 'Weekdays, 12pm to 1pm' : 'Weekdays, 9am to 5pm'}
          </Text>
        </Pressable>
        {windows.length > 0 ? (
          <Pressable onPress={() => setWindows([])} style={styles.quickChip}>
            <Text style={styles.quickText}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.days}>
        {DAYS.map(({ weekday, label }) => {
          const day = windows
            .filter((w) => w.weekday === weekday)
            .sort((a, b) => a.startMinute - b.startMinute);
          return (
            <View key={weekday} style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{label}</Text>
                {day.length === 0 ? <Text style={styles.off}>Off</Text> : null}
              </View>
              {day.map((w, i) => (
                <View key={i} style={styles.windowRow}>
                  <TimeStepper
                    label={`${label} start`}
                    value={w.startMinute}
                    onAdjust={(delta) => adjust(w, 'startMinute', delta)}
                  />
                  <Text style={styles.to}>to</Text>
                  <TimeStepper
                    label={`${label} end`}
                    value={w.endMinute}
                    onAdjust={(delta) => adjust(w, 'endMinute', delta)}
                  />
                  <Pressable
                    onPress={() => removeWindow(w)}
                    hitSlop={12}
                    accessibilityLabel={`Remove ${label} hours`}
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <View style={styles.dayActions}>
                <Pressable onPress={() => addWindow(weekday)} hitSlop={8}>
                  <Text style={styles.link}>{day.length === 0 ? 'Add hours' : 'Add another block'}</Text>
                </Pressable>
                {day.length > 0 && WORKDAYS.includes(weekday) ? (
                  <Pressable onPress={() => copyToWorkdays(weekday)} hitSlop={8}>
                    <Text style={styles.link}>Copy to all weekdays</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.summary}>
        {totalMinutes === 0
          ? intro
            ? 'No intro hours yet. Customers cannot book a free intro until you add some.'
            : 'No weekly hours yet. Customers will only see dates you add below.'
          : `${(totalMinutes / 60).toFixed(totalMinutes % 60 === 0 ? 0 : 1)} hours a week, room for ${Math.floor(totalMinutes / (intro ? INTRO_MINUTES : SESSION_MINUTES))} ${intro ? 'intro calls' : 'sessions'}.`}
      </Text>
      {dirty ? <Text style={styles.notice}>You have unsaved changes.</Text> : null}
      <Button
        title={
          dirty || zoneChanged || zoneMissing
            ? intro
              ? 'Save intro hours'
              : 'Save weekly hours'
            : 'Saved'
        }
        onPress={onSave}
        loading={saving}
        disabled={!dirty && !zoneChanged && !zoneMissing}
      />
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
  <View style={styles.stepper}>
    <Pressable onPress={() => onAdjust(-30)} hitSlop={8} accessibilityLabel={`${label} earlier`}>
      <Text style={styles.stepperButton}>−</Text>
    </Pressable>
    <Text style={styles.stepperValue}>{formatMinutes(value)}</Text>
    <Pressable onPress={() => onAdjust(30)} hitSlop={8} accessibilityLabel={`${label} later`}>
      <Text style={styles.stepperButton}>+</Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  caption: { ...typography.caption, color: colors.textSecondary },
  notice: { ...typography.caption, color: colors.warning },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  quickText: { ...typography.bodyStrong, color: colors.textPrimary },
  days: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayBlock: {
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  off: { ...typography.caption, color: colors.textMuted },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  to: { ...typography.caption, color: colors.textMuted },
  dayActions: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  link: { ...typography.caption, color: colors.accentInk, fontFamily: 'Manrope_600SemiBold' },
  removeText: { ...typography.bodyStrong, color: colors.danger, paddingHorizontal: spacing.sm },
  summary: { ...typography.caption, color: colors.textSecondary },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  stepperButton: { ...typography.heading, color: colors.textPrimary, paddingHorizontal: spacing.sm },
  stepperValue: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center' },
});
