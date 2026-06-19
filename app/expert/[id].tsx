import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { CredentialBadge } from '@/components/expert/CredentialBadge';
import { PaymentSheet } from '@/components/booking/PaymentSheet';
import { TimeSlotPicker } from '@/components/booking/TimeSlotPicker';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { RatingStars } from '@/components/ui/RatingStars';
import { Screen } from '@/components/ui/Screen';
import { industryById } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useCreateBooking } from '@/hooks/useBookings';
import { useExpert } from '@/hooks/useExperts';
import { addMinutes } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import type { CallMedium, TimeSlot } from '@/types/booking';

const buildSlotsForTomorrow = (): TimeSlot[] => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return Array.from({ length: 8 }).map((_, i) => {
    const start = new Date(tomorrow.getTime() + i * 60 * 60_000);
    return { startIso: start.toISOString(), endIso: addMinutes(start.toISOString(), 30) };
  });
};

export default function ExpertProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: expert, isLoading } = useExpert(id);
  const slots = useMemo(() => buildSlotsForTomorrow(), []);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [medium, setMedium] = useState<CallMedium>('video');
  const { mutate: book, isPending } = useCreateBooking();

  if (isLoading && !expert) return <LoadingView label="Loading expert…" />;
  if (!expert) {
    return (
      <Screen>
        <EmptyState title="Expert not found" emoji="🤷" />
      </Screen>
    );
  }

  const industry = industryById(expert.industryId);

  const onPay = () => {
    if (!selectedSlot) return;
    book(
      { expertId: expert.id, slot: selectedSlot, medium },
      {
        onSuccess: (booking) => {
          Toast.show({
            type: 'success',
            text1: 'Booking confirmed',
            text2: `Calendar event added. See you soon.`,
          });
          router.replace(`/booking/${booking.id}`);
        },
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not book',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  return (
    <Screen padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Image
          source={{ uri: expert.coverImageUrl }}
          style={styles.cover}
          transition={200}
          contentFit="cover"
        />
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Avatar uri={expert.avatarUrl} name={expert.displayName} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{expert.displayName}</Text>
              <Text style={styles.headline}>{expert.headline}</Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            {industry && <Badge label={`${industry.emoji}  ${industry.label}`} />}
            {expert.verified && <Badge label="Verified" tone="success" />}
            <Badge label={`${expert.yearsExperience}y experience`} tone="accent" />
          </View>

          <RatingStars value={expert.ratingAverage} count={expert.ratingCount} size={18} />
          {expert.bio ? <Text style={styles.bio}>{expert.bio}</Text> : null}

          <Text style={styles.sectionTitle}>Credentials</Text>
          <View style={{ gap: spacing.sm }}>
            {expert.credentials.map((c) => (
              <CredentialBadge key={c.id} credential={c} />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Pick a time (tomorrow)</Text>
          <TimeSlotPicker slots={slots} selected={selectedSlot} onSelect={setSelectedSlot} />

          <Text style={styles.sectionTitle}>How would you like to talk?</Text>
          <View style={styles.mediumRow}>
            <Button
              title="Video"
              variant={medium === 'video' ? 'primary' : 'secondary'}
              onPress={() => setMedium('video')}
              style={{ flex: 1 }}
            />
            <Button
              title="Phone"
              variant={medium === 'phone' ? 'primary' : 'secondary'}
              onPress={() => setMedium('phone')}
              style={{ flex: 1 }}
            />
          </View>

          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Rate</Text>
            <Text style={styles.rateValue}>{formatCurrency(expert.hourlyRate)}/hr</Text>
          </View>

          <PaymentSheet
            amountCents={expert.hourlyRate}
            expertName={expert.displayName}
            onPay={onPay}
            loading={isPending}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl },
  cover: { width: '100%', height: 220, backgroundColor: colors.surfaceAlt },
  body: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.title, color: colors.textPrimary },
  headline: { ...typography.body, color: colors.textSecondary },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  bio: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.md },
  mediumRow: { flexDirection: 'row', gap: spacing.md },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rateLabel: { ...typography.body, color: colors.textSecondary },
  rateValue: { ...typography.heading, color: colors.textPrimary },
});
