import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { AvailabilityCalendarEditor } from '@/components/expert/AvailabilityCalendarEditor';
import { AvailabilityEditor } from '@/components/expert/AvailabilityEditor';
import { BackgroundEditor } from '@/components/expert/BackgroundEditor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { industries } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  useMyExpertProfile,
  useStartConnectOnboarding,
  useSyncConnectStatus,
  useUpsertMyExpertProfile,
} from '@/hooks/useExperts';
import { useUploadImage } from '@/hooks/useProfile';

type Form = {
  industryId: string;
  headline: string;
  hourlyRateDollars: string;
  yearsExperience: string;
  coverImageUrl: string;
  howICanHelp: string;
};

const emptyForm: Form = {
  industryId: '',
  headline: '',
  hourlyRateDollars: '',
  yearsExperience: '',
  coverImageUrl: '',
  howICanHelp: '',
};

export default function ExpertProfileEditScreen() {
  const router = useRouter();
  const { data: existing, isLoading } = useMyExpertProfile();
  const { mutate: upsert, isPending } = useUpsertMyExpertProfile();
  const { mutateAsync: upload, isPending: uploadingCover } = useUploadImage();
  const [form, setForm] = useState<Form>(emptyForm);

  useEffect(() => {
    if (existing) {
      setForm({
        industryId: existing.industryId,
        headline: existing.headline,
        hourlyRateDollars: (existing.hourlyRate / 100).toString(),
        yearsExperience: existing.yearsExperience.toString(),
        coverImageUrl: existing.coverImageUrl ?? '',
        howICanHelp: existing.howICanHelp ?? '',
      });
    }
  }, [existing]);

  if (isLoading) return <LoadingView label="Loading your profile…" />;

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Photo permission needed' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    try {
      const url = await upload({
        bucket: 'cover-images',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setForm({ ...form, coverImageUrl: url });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Cover upload failed',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const onSave = () => {
    if (!form.industryId) {
      Toast.show({ type: 'error', text1: 'Pick an industry' });
      return;
    }
    if (!form.headline.trim()) {
      Toast.show({ type: 'error', text1: 'Add a headline' });
      return;
    }
    const rate = Number(form.hourlyRateDollars);
    if (!Number.isFinite(rate) || rate <= 0) {
      Toast.show({ type: 'error', text1: 'Hourly rate must be a positive number' });
      return;
    }
    const years = Number(form.yearsExperience);
    if (!Number.isFinite(years) || years < 0) {
      Toast.show({ type: 'error', text1: 'Years of experience must be 0 or more' });
      return;
    }
    upsert(
      {
        industryId: form.industryId,
        headline: form.headline.trim(),
        hourlyRateCents: Math.round(rate * 100),
        yearsExperience: Math.floor(years),
        coverImageUrl: form.coverImageUrl || null,
        howICanHelp: form.howICanHelp.trim() || null,
      },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: existing ? 'Profile updated' : 'You are live' });
          if (!existing) router.replace('/(tabs)/studio');
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
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionHeader
          title={existing ? 'Edit expert profile' : 'Become an expert'}
          caption="Fill these in to appear on Discover. You can edit anytime."
        />

        <Text style={styles.label}>Cover image</Text>
        <Pressable onPress={pickCover} style={styles.coverPicker}>
          {form.coverImageUrl ? (
            <Image source={{ uri: form.coverImageUrl }} style={styles.coverImage} contentFit="cover" />
          ) : (
            <Text style={styles.coverPlaceholder}>
              {uploadingCover ? 'Uploading…' : 'Tap to choose a cover photo'}
            </Text>
          )}
        </Pressable>

        <Text style={styles.label}>Industry</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {industries.map((i) => {
            const active = form.industryId === i.id;
            return (
              <Pressable
                key={i.id}
                onPress={() => setForm({ ...form, industryId: i.id })}
                style={[chipStyles.chip, active && chipStyles.active]}
              >
                <Text style={[chipStyles.text, active && chipStyles.activeText]}>
                  {i.emoji} {i.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>Headline</Text>
        <TextInput
          placeholder="One sentence on what you offer"
          placeholderTextColor={colors.textMuted}
          value={form.headline}
          onChangeText={(headline) => setForm({ ...form, headline })}
          style={styles.input}
          maxLength={120}
        />

        <Text style={styles.label}>How can I help?</Text>
        <Text style={styles.helper}>
          Spell out who you&apos;re for and the kinds of problems you can solve.
        </Text>
        <TextInput
          placeholder={'e.g. I help early founders pressure-test their go-to-market and pricing.\n• 1:1 strategy calls\n• Pitch deck reviews\n• Hiring plans'}
          placeholderTextColor={colors.textMuted}
          value={form.howICanHelp}
          onChangeText={(howICanHelp) => setForm({ ...form, howICanHelp })}
          multiline
          style={[styles.input, styles.longInput]}
          maxLength={1500}
        />

        <Text style={styles.label}>Hourly rate (USD)</Text>
        <TextInput
          placeholder="150"
          placeholderTextColor={colors.textMuted}
          value={form.hourlyRateDollars}
          onChangeText={(hourlyRateDollars) => setForm({ ...form, hourlyRateDollars })}
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.label}>Years of experience</Text>
        <TextInput
          placeholder="10"
          placeholderTextColor={colors.textMuted}
          value={form.yearsExperience}
          onChangeText={(yearsExperience) => setForm({ ...form, yearsExperience })}
          keyboardType="number-pad"
          style={styles.input}
        />

        <Button
          title={existing ? 'Save changes' : 'Save and continue'}
          onPress={onSave}
          loading={isPending}
          fullWidth
          style={{ marginTop: spacing.lg }}
        />

        {existing && (
          <>
            <SectionHeader title="Payouts" caption="Get paid via Stripe Connect (test mode)." />
            <PayoutsCard expert={existing} />

            <SectionHeader title="Background" caption="Work, education, certifications." />
            <BackgroundEditor entries={existing.credentials} />

            <SectionHeader title="Availability" caption="Recurring weekly hours plus one-off dates." />
            <Text style={styles.subHeader}>Recurring weekly hours</Text>
            <AvailabilityEditor initial={existing.availability} />
            <Text style={[styles.subHeader, { marginTop: spacing.lg }]}>Specific dates</Text>
            <AvailabilityCalendarEditor dates={existing.availabilityDates} />
          </>
        )}

        <Button title="Done" variant="ghost" onPress={() => router.back()} fullWidth />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  helper: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  subHeader: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  longInput: { minHeight: 140, textAlignVertical: 'top' },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  coverPicker: {
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { ...typography.body, color: colors.textMuted },
});

const chipStyles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  active: { backgroundColor: colors.textPrimary },
  text: { ...typography.bodyStrong, color: colors.textPrimary },
  activeText: { color: '#FFFFFF' },
});

const PayoutsCard = ({
  expert,
}: {
  expert: { stripeConnectAccountId: string | null; stripeConnectPayoutsEnabled: boolean };
}) => {
  const { mutate: start, isPending } = useStartConnectOnboarding();
  const { mutate: sync, isPending: syncing } = useSyncConnectStatus();
  const isReady = expert.stripeConnectPayoutsEnabled;
  const isStarted = Boolean(expert.stripeConnectAccountId) && !isReady;

  const status = isReady
    ? { label: 'Ready', tone: 'success' as const }
    : isStarted
      ? { label: 'In progress', tone: 'warning' as const }
      : { label: 'Not set up', tone: 'neutral' as const };

  const onPress = () =>
    start(undefined, {
      onSuccess: (result) => {
        const nowReady = result.status?.payoutsEnabled;
        Toast.show({
          type: 'success',
          text1: nowReady ? 'Payouts enabled' : 'Returned from Stripe',
          text2: nowReady
            ? 'Ready to accept bookings that pay out to you.'
            : result.status?.status === 'action-required'
              ? 'Stripe still needs some info. Tap "Finish Stripe setup" again.'
              : 'We will pick up your status from Stripe.',
        });
      },
      onError: (err) =>
        Toast.show({
          type: 'error',
          text1: 'Could not open Stripe',
          text2: err instanceof Error ? err.message : 'Unknown error',
        }),
    });

  const onRefresh = () =>
    sync(undefined, {
      onSuccess: (result) => {
        Toast.show({
          type: result.payoutsEnabled ? 'success' : 'info',
          text1: result.payoutsEnabled ? 'Payouts enabled' : 'Not ready yet',
          text2:
            result.missingRequirements && result.missingRequirements.length > 0
              ? `Stripe needs: ${result.missingRequirements.slice(0, 2).join(', ')}${
                  result.missingRequirements.length > 2 ? '…' : ''
                }`
              : `Status: ${result.status}`,
        });
      },
      onError: (err) =>
        Toast.show({
          type: 'error',
          text1: 'Could not check status',
          text2: err instanceof Error ? err.message : 'Unknown error',
        }),
    });

  return (
    <Card>
      <View style={payoutsStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={payoutsStyles.title}>Stripe Connect</Text>
          <Text style={payoutsStyles.body}>
            Customers pay you through Stripe. Until you finish onboarding, payments are held by the
            platform. Test mode uses fake bank info — fill anything plausible.
          </Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Button
        title={
          isReady
            ? 'Update payout info'
            : isStarted
              ? 'Finish Stripe setup'
              : 'Set up payouts via Stripe'
        }
        variant="secondary"
        onPress={onPress}
        loading={isPending}
        style={{ marginTop: spacing.md }}
      />
      {isStarted && (
        <Button
          title={syncing ? 'Checking Stripe…' : 'Refresh status'}
          variant="ghost"
          onPress={onRefresh}
          loading={syncing}
          style={{ marginTop: spacing.xs }}
        />
      )}
    </Card>
  );
};

const payoutsStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
});
