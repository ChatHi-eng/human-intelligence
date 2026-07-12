import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { industries } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useMyExpertProfile, useUpsertMyExpertProfile } from '@/hooks/useExperts';
import { useUploadImage } from '@/hooks/useProfile';

const STEPS = ['Field', 'Pitch', 'Pricing', 'Photo'] as const;

export default function ExpertOnboardingScreen() {
  const router = useRouter();
  const { data: existing, isLoading } = useMyExpertProfile();
  const { mutate: upsert, isPending: saving } = useUpsertMyExpertProfile();
  const { mutateAsync: upload, isPending: uploading } = useUploadImage();

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [industryId, setIndustryId] = useState('');
  const [headline, setHeadline] = useState('');
  const [howICanHelp, setHowICanHelp] = useState('');
  const [rateDollars, setRateDollars] = useState('');
  const [years, setYears] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');

  if (isLoading) return <LoadingView label="Loading…" />;
  // Already an expert → this wizard isn't for you; edit instead.
  if (existing && !done) return <Redirect href="/expert-profile-edit" />;

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
      setCoverImageUrl(url);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const validateStep = (): boolean => {
    if (step === 0 && !industryId) {
      Toast.show({ type: 'error', text1: 'Pick your field' });
      return false;
    }
    if (step === 1 && !headline.trim()) {
      Toast.show({ type: 'error', text1: 'Write a headline' });
      return false;
    }
    if (step === 2) {
      const rate = Number(rateDollars);
      if (!Number.isFinite(rate) || rate <= 0) {
        Toast.show({ type: 'error', text1: 'Set a positive hourly rate' });
        return false;
      }
      const y = Number(years);
      if (!Number.isFinite(y) || y < 0) {
        Toast.show({ type: 'error', text1: 'Years of experience must be 0 or more' });
        return false;
      }
    }
    return true;
  };

  const onNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    // Final step → create the profile.
    upsert(
      {
        industryId,
        headline: headline.trim(),
        hourlyRateCents: Math.round(Number(rateDollars) * 100),
        yearsExperience: Math.floor(Number(years)),
        coverImageUrl: coverImageUrl || null,
        howICanHelp: howICanHelp.trim() || null,
      },
      {
        onSuccess: () => setDone(true),
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not save',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  if (done) {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>You&apos;re live</Text>
          <Text style={styles.doneBody}>
            You&apos;re now one of the humans on Palam. One thing left: customers can only book you
            once you open up availability.
          </Text>
          <Button
            title="Set your availability"
            onPress={() => router.replace('/expert-profile-edit')}
            fullWidth
          />
          <Button
            title="Go to Studio"
            variant="ghost"
            onPress={() => router.replace('/(tabs)/studio')}
            fullWidth
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.progressRow}>
        {STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: spacing.xs }}>
            <View style={[styles.progressBar, i <= step && styles.progressBarActive]} />
            <Text style={[styles.progressLabel, i === step && styles.progressLabelActive]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <>
            <Text style={styles.title}>What&apos;s your field?</Text>
            <Text style={styles.caption}>Customers browse by category — pick the closest fit.</Text>
            <View style={styles.industryGrid}>
              {industries.map((i) => {
                const active = industryId === i.id;
                return (
                  <Pressable
                    key={i.id}
                    onPress={() => setIndustryId(i.id)}
                    style={[styles.industryTile, active && styles.industryTileActive]}
                  >
                    <Text style={styles.industryEmoji}>{i.emoji}</Text>
                    <Text style={[styles.industryLabel, active && styles.industryLabelActive]}>
                      {i.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>Your pitch</Text>
            <Text style={styles.caption}>
              The headline shows on your Discover card. The longer pitch shows on your profile.
            </Text>
            <Text style={styles.label}>Headline</Text>
            <TextInput
              placeholder="One sentence on what you offer"
              placeholderTextColor={colors.textMuted}
              value={headline}
              onChangeText={setHeadline}
              style={styles.input}
              maxLength={120}
            />
            <Text style={styles.label}>How can you help? (optional, recommended)</Text>
            <TextInput
              placeholder={'Who are you for, and what problems do you solve?\n• 1:1 strategy calls\n• Portfolio reviews'}
              placeholderTextColor={colors.textMuted}
              value={howICanHelp}
              onChangeText={setHowICanHelp}
              multiline
              style={[styles.input, styles.longInput]}
              maxLength={1500}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Pricing & experience</Text>
            <Text style={styles.caption}>
              Sessions are 30 minutes — customers pay half your hourly rate per session. You can
              change this anytime.
            </Text>
            <Text style={styles.label}>Hourly rate (USD)</Text>
            <TextInput
              placeholder="150"
              placeholderTextColor={colors.textMuted}
              value={rateDollars}
              onChangeText={setRateDollars}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Text style={styles.label}>Years of experience</Text>
            <TextInput
              placeholder="10"
              placeholderTextColor={colors.textMuted}
              value={years}
              onChangeText={setYears}
              keyboardType="number-pad"
              style={styles.input}
            />
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Add a cover photo</Text>
            <Text style={styles.caption}>
              Profiles with a photo get booked more. Skippable — you can add one later.
            </Text>
            <Pressable onPress={pickCover} style={styles.coverPicker}>
              {coverImageUrl ? (
                <Image source={{ uri: coverImageUrl }} style={styles.coverImage} contentFit="cover" />
              ) : (
                <Text style={styles.coverPlaceholder}>
                  {uploading ? 'Uploading…' : 'Tap to choose a photo'}
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />
        ) : (
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        )}
        <Button
          title={step === STEPS.length - 1 ? 'Go live' : 'Next'}
          onPress={onNext}
          loading={saving}
          style={{ flex: 2 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.lg },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt },
  progressBarActive: { backgroundColor: colors.accent },
  progressLabel: { ...typography.label, color: colors.textMuted, textAlign: 'center' },
  progressLabelActive: { color: colors.textPrimary },
  scroll: { paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  longInput: { minHeight: 140, textAlignVertical: 'top' },
  industryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  industryTile: {
    width: '47%',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    gap: spacing.xs,
  },
  industryTileActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  industryEmoji: { fontSize: 28 },
  industryLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  industryLabelActive: { color: '#FFFFFF' },
  coverPicker: {
    height: 180,
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
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  doneWrap: { flex: 1, justifyContent: 'center', gap: spacing.md },
  doneEmoji: { fontSize: 64, textAlign: 'center' },
  doneTitle: { ...typography.display, color: colors.textPrimary, textAlign: 'center' },
  doneBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
