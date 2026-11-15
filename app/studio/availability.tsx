import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { AvailabilityCalendarEditor } from '@/components/expert/AvailabilityCalendarEditor';
import { AvailabilityEditor } from '@/components/expert/AvailabilityEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  BOOKING_WINDOW_DAYS,
  BUFFER_OPTIONS_MINUTES,
  MIN_BOOKING_NOTICE_MINUTES,
} from '@/constants/business';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useMyExpertProfile, useUpdateExpertSettings } from '@/hooks/useExperts';
import { formatDateTime } from '@/lib/date';
import { generateSlots } from '@/lib/slots';

// One place for an expert's schedule: weekly hours, extra dates and days off,
// plus a plain statement of what customers can book right now.
export default function AvailabilityScreen() {
  const router = useRouter();
  const { data: expert, isLoading } = useMyExpertProfile();
  const { mutate: updateSettings, isPending: savingSettings } = useUpdateExpertSettings();
  const onSettingsError = (err: unknown) =>
    Toast.show({
      type: 'error',
      text1: 'Could not save',
      text2: err instanceof Error ? err.message : 'Unknown error',
    });

  const openSlots = useMemo(
    () =>
      expert
        ? generateSlots(expert.availability, expert.availabilityDates, [], {
            timeZone: expert.timezone,
            bufferMinutes: expert.bufferMinutes,
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
            {expert.paused
              ? 'Your profile is paused. You are hidden from Discover and nobody can book you until you switch it back on.'
              : first
              ? `${openSlots.length} open times in the next ${BOOKING_WINDOW_DAYS} days. The next one is ${formatDateTime(first.startIso)}.`
              : `No open times in the next ${BOOKING_WINDOW_DAYS} days. Add weekly hours or a date below so customers can book you.`}
          </Text>
          <Text style={styles.cardNote}>
            Times closer than {MIN_BOOKING_NOTICE_MINUTES / 60} hours away are not offered, so a
            session never lands on you without warning.
          </Text>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Pause my profile</Text>
              <Text style={styles.cardNote}>
                Hides you from Discover and stops new bookings. Your hours and any sessions
                already booked stay as they are.
              </Text>
            </View>
            <Switch
              value={expert.paused}
              disabled={savingSettings}
              accessibilityLabel="Pause my profile"
              onValueChange={(paused) =>
                updateSettings(
                  { paused },
                  {
                    onSuccess: () =>
                      Toast.show({
                        type: 'success',
                        text1: paused ? 'Profile paused' : 'You are bookable again',
                      }),
                    onError: onSettingsError,
                  },
                )
              }
            />
          </View>

          <View>
            <Text style={styles.cardTitle}>Gap between sessions</Text>
            <Text style={styles.cardNote}>
              Time kept free before and after every booked session.
            </Text>
            <View style={styles.gapRow}>
              {BUFFER_OPTIONS_MINUTES.map((minutes) => {
                const active = expert.bufferMinutes === minutes;
                return (
                  <Pressable
                    key={minutes}
                    disabled={savingSettings}
                    onPress={() =>
                      updateSettings({ bufferMinutes: minutes }, { onError: onSettingsError })
                    }
                    style={[styles.gapChip, active && styles.gapChipActive]}
                  >
                    <Text style={[styles.gapText, active && styles.gapTextActive]}>
                      {minutes === 0 ? 'None' : `${minutes} min`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
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
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gapRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  gapChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  gapChipActive: { backgroundColor: colors.textPrimary },
  gapText: { ...typography.bodyStrong, color: colors.textPrimary },
  gapTextActive: { color: '#FFFFFF' },
});
