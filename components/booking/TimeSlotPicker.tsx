import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { formatTime } from '@/lib/date';
import type { TimeSlot } from '@/types/booking';

export type TimeSlotPickerProps = {
  slots: TimeSlot[];
  selected: TimeSlot | null;
  onSelect: (slot: TimeSlot) => void;
};

const sameSlot = (a: TimeSlot | null, b: TimeSlot) =>
  Boolean(a && a.startIso === b.startIso && a.endIso === b.endIso);

export const TimeSlotPicker = ({ slots, selected, onSelect }: TimeSlotPickerProps) => (
  <View style={styles.grid}>
    {slots.map((slot) => {
      const active = sameSlot(selected, slot);
      return (
        <Pressable
          key={slot.startIso}
          onPress={() => onSelect(slot)}
          style={[styles.chip, active && styles.chipActive]}
        >
          <Text style={[styles.text, active && styles.textActive]}>{formatTime(slot.startIso)}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  text: { ...typography.bodyStrong, color: colors.textPrimary },
  textActive: { color: '#FFFFFF' },
});
