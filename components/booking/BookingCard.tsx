import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import { formatDateTime, minutesBetween } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import type { Booking } from '@/types/booking';
import type { Expert } from '@/types/user';

export type BookingCardProps = {
  booking: Booking;
  expert: Expert | undefined;
  onPress?: () => void;
};

const statusTone = (status: Booking['status']) => {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmed', tone: 'accent' as const };
    case 'in_progress':
      return { label: 'In progress', tone: 'success' as const };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' as const };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'warning' as const };
    case 'requested':
      return { label: 'Awaiting expert', tone: 'warning' as const };
  }
};

export const BookingCard = ({ booking, expert, onPress }: BookingCardProps) => {
  const status = statusTone(booking.status);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.row}>
        <Avatar uri={expert?.avatarUrl} name={expert?.displayName ?? 'Expert'} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{expert?.displayName ?? 'Expert'}</Text>
          <Text style={styles.meta}>{formatDateTime(booking.slot.startIso)}</Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerLabel}>
          {minutesBetween(booking.slot.startIso, booking.slot.endIso)} min ·{' '}
          {booking.medium === 'video' ? 'Video' : 'Phone'}
        </Text>
        <Text style={styles.price}>{formatCurrency(booking.priceCents)}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  footerLabel: { ...typography.caption, color: colors.textSecondary },
  price: { ...typography.bodyStrong, color: colors.textPrimary },
});
