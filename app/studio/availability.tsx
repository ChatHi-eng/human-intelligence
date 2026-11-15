import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { AvailabilityCalendarEditor } from '@/components/expert/AvailabilityCalendarEditor';
import { AvailabilityEditor } from '@/components/expert/AvailabilityEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { BOOKING_WINDOW_DAYS, MIN_BOOKING_NOTICE_MINUTES } from '@/constants/business';
import { colors, spacing, typography } from '@/constants/theme';
import { useMyExpertProfile } from '@/hooks/useExperts';
import { formatDateTime } from '@/lib/date';
import { generateSlots } from '@/lib/slots';

// One place for an expert's schedule: weekly hours, extra dates and days off,
// plus a plain statement of what customers can book right now.
export default function AvailabilityScreen() {
  const router = useRouter();
  const { data: expert, isLoading } = useMyExpertProfile();

  const openSlots = useMemo(
    () =>
      expert
        ? generateSlots(expert.availability, expert.availabilityDates, [], {
            timeZone: expert.timezone,
            minNoticeMinutes: MIN_BOOKING_NOTICE_MINUTES,
            daysAhead: BOOKING_WINDOW_DAYS,
          })
        : [],
    [expert],
  );

  if (isLoading) return <LoadingView label="Loading your schedule…" />;
  if (!expert) return <Redirect href="/expert-onboarding" />;

  const first = openSlots[0];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionHeader
          title="Availability"
          caption="When customers can book 30-minute sessions with you."
        />

        <Card>
          <Text style={styles.cardTitle}>What customers see</Text>
          <Text style={styles.cardBody}>
            {first
              ? `${openSlots.length} open times in the next ${BOOKING_WINDOW_DAYS} days. The next one is ${formatDateTime(first.startIso)}.`
              : `No open times in the next ${BOOKING_WINDOW_DAYS} days. Add weekly hours or a date below so customers can book you.`}
          </Text>
          <Text style={styles.cardNote}>
            Times closer than {MIN_BOOKING_NOTICE_MINUTES / 60} hours away are not offered, so you
            always have time to accept a request.
          </Text>
        </Card>

        <SectionHeader title="Weekly hours" />
        <AvailabilityEditor initial={expert.availability} savedTimeZone={expert.timezone} />

        <SectionHeader title="Specific dates" caption="Extra hours, or a day off." />
        <AvailabilityCalendarEditor dates={expert.availabilityDates} weekly={expert.availability} />

        <Button title="Done" variant="ghost" onPress={() => router.back()} fullWidth />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  cardTitle: { ...typography.heading, color: colors.textPrimary },
  cardBody: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  cardNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
});
