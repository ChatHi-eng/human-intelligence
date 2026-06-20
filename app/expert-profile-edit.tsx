import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import { AvailabilityEditor } from '@/components/expert/AvailabilityEditor';
import { CredentialsEditor } from '@/components/expert/CredentialsEditor';
import { Button } from '@/components/ui/Button';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { industries } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useMyExpertProfile, useUpsertMyExpertProfile } from '@/hooks/useExperts';
import { useUploadImage } from '@/hooks/useProfile';

type Form = {
  industryId: string;
  headline: string;
  hourlyRateDollars: string;
  yearsExperience: string;
  coverImageUrl: string;
};

const emptyForm: Form = {
  industryId: '',
  headline: '',
  hourlyRateDollars: '',
  yearsExperience: '',
  coverImageUrl: '',
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
      },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: existing ? 'Profile updated' : 'You are live' });
          if (!existing) router.replace('/(expert)/dashboard');
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
            <SectionHeader title="Credentials" />
            <CredentialsEditor credentials={existing.credentials} />

            <SectionHeader title="Weekly availability" />
            <AvailabilityEditor initial={existing.availability} />
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
