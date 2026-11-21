import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BackgroundEditor } from '@/components/expert/BackgroundEditor';
import { Button } from '@/components/ui/Button';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { industries, OTHER_INDUSTRY_ID } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useMyExpertProfile, useUpsertMyExpertProfile } from '@/hooks/useExperts';
import { useUploadImage } from '@/hooks/useProfile';
import { currentProfileInput } from '@/lib/expertProfile';

// One section of the expert profile at a time. The expert reaches this from
// the Edit link beside a section on their own profile page, changes that one
// thing, and saves it. Nothing else on the profile is touched.
type Section = 'identity' | 'topics' | 'help' | 'cover' | 'background';

const SECTIONS: Record<Section, { title: string; caption: string }> = {
  identity: {
    title: 'Who you are',
    caption: 'Your field, role and the one line under your name.',
  },
  topics: {
    title: 'Ask me about',
    caption: 'The specific things people can ask you about. Up to six.',
  },
  help: {
    title: 'How I can help',
    caption: 'The part customers read most closely before they book.',
  },
  cover: { title: 'Cover image', caption: 'The wide image at the top of your profile.' },
  background: {
    title: 'Background',
    caption: 'Work, education and certifications that back up what you offer.',
  },
};

const MAX_TOPICS = 6;

const isSection = (value: unknown): value is Section =>
  typeof value === 'string' && value in SECTIONS;

export default function ExpertProfileEditScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ section?: string }>();
  const { data: existing, isLoading } = useMyExpertProfile();
  const { mutate: upsert, isPending } = useUpsertMyExpertProfile();
  const { mutateAsync: upload, isPending: uploadingCover } = useUploadImage();

  const [industryId, setIndustryId] = useState('');
  const [industryCustom, setIndustryCustom] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [years, setYears] = useState('');
  const [headline, setHeadline] = useState('');
  const [howICanHelp, setHowICanHelp] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setIndustryId(existing.industryId);
    setIndustryCustom(existing.industryCustom ?? '');
    setCurrentTitle(existing.currentTitle ?? '');
    setCurrentCompany(existing.currentCompany ?? '');
    setYears(String(existing.yearsExperience));
    setHeadline(existing.headline);
    setHowICanHelp(existing.howICanHelp ?? '');
    setTopics(existing.topics);
    setCoverImageUrl(existing.coverImageUrl ?? '');
  }, [existing]);

  if (isLoading) return <LoadingView label="Loading your profile…" />;
  // First-time setup goes through the step-by-step wizard instead.
  if (!existing) return <Redirect href="/expert-onboarding" />;
  // With no section named, the profile page itself is the place to edit from.
  if (!isSection(params.section)) {
    return <Redirect href={{ pathname: '/expert/[id]', params: { id: user?.id ?? existing.id } }} />;
  }
  const section = params.section;
  const other = industryId === OTHER_INDUSTRY_ID;

  const dirty =
    section === 'identity'
      ? industryId !== existing.industryId ||
        industryCustom.trim() !== (existing.industryCustom ?? '') ||
        currentTitle.trim() !== (existing.currentTitle ?? '') ||
        currentCompany.trim() !== (existing.currentCompany ?? '') ||
        years.trim() !== String(existing.yearsExperience) ||
        headline.trim() !== existing.headline
      : section === 'topics'
        ? topics.join('|') !== existing.topics.join('|')
        : section === 'help'
          ? howICanHelp.trim() !== (existing.howICanHelp ?? '')
          : section === 'cover'
            ? coverImageUrl !== (existing.coverImageUrl ?? '')
            : false;

  const addTopic = () => {
    const next = topicDraft.trim().replace(/,+$/, '');
    if (!next) return;
    if (topics.length >= MAX_TOPICS) {
      setErrors({ topics: `You can list up to ${MAX_TOPICS}. Remove one to add another.` });
      return;
    }
    if (!topics.some((t) => t.toLowerCase() === next.toLowerCase())) setTopics([...topics, next]);
    setTopicDraft('');
    setErrors({});
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      setErrors({ cover: 'Palam needs permission to open your photos.' });
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
      setErrors({});
    } catch (err) {
      setErrors({ cover: err instanceof Error ? err.message : 'The upload failed. Try again.' });
    }
  };

  const onSave = () => {
    const found: Record<string, string> = {};
    const yearsNumber = Number(years);
    if (section === 'identity') {
      if (!industryId) found.field = 'Pick your field.';
      if (other && !industryCustom.trim()) found.fieldCustom = 'Type the name of your field.';
      if (!headline.trim()) found.headline = 'Write one line on what you offer.';
      if (!Number.isFinite(yearsNumber) || yearsNumber < 0 || years.trim() === '') {
        found.years = 'Enter a number, 0 or more.';
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const changes =
      section === 'identity'
        ? {
            industryId,
            industryCustom: other ? industryCustom.trim() : null,
            currentTitle: currentTitle.trim() || null,
            currentCompany: currentCompany.trim() || null,
            yearsExperience: Math.floor(yearsNumber),
            headline: headline.trim(),
          }
        : section === 'topics'
          ? { topics }
          : section === 'help'
            ? { howICanHelp: howICanHelp.trim() || null }
            : { coverImageUrl: coverImageUrl || null };

    upsert(
      { ...currentProfileInput(existing), ...changes },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Saved. Live on your profile now.' });
          router.back();
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

  const onCancel = () => {
    if (dirty) setConfirmDiscard(true);
    else router.back();
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader level="page" title={SECTIONS[section].title} caption={SECTIONS[section].caption} />

        {section === 'identity' ? (
          <>
            <Text style={styles.label}>Field</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {industries.map((i) => (
                <Chip
                  key={i.id}
                  label={i.label}
                  active={industryId === i.id}
                  onPress={() => setIndustryId(i.id)}
                />
              ))}
              <Chip
                label="✨ Something else"
                active={other}
                onPress={() => setIndustryId(OTHER_INDUSTRY_ID)}
              />
            </ScrollView>
            <FieldError message={errors.field} />
            {other ? (
              <>
                <TextInput
                  placeholder="Your field, e.g. Veterinary medicine"
                  placeholderTextColor={colors.textMuted}
                  value={industryCustom}
                  onChangeText={setIndustryCustom}
                  style={[styles.input, errors.fieldCustom ? styles.inputError : null]}
                  maxLength={60}
                />
                <FieldError message={errors.fieldCustom} />
              </>
            ) : null}

            <Text style={styles.label}>Current role</Text>
            <TextInput
              placeholder="e.g. Senior Product Designer"
              placeholderTextColor={colors.textMuted}
              value={currentTitle}
              onChangeText={setCurrentTitle}
              style={styles.input}
              maxLength={80}
            />

            <Text style={styles.label}>Company or practice (optional)</Text>
            <TextInput
              placeholder="e.g. Acme, or Self-employed"
              placeholderTextColor={colors.textMuted}
              value={currentCompany}
              onChangeText={setCurrentCompany}
              style={styles.input}
              maxLength={80}
            />

            <Text style={styles.label}>Years of experience</Text>
            <TextInput
              placeholder="10"
              placeholderTextColor={colors.textMuted}
              value={years}
              onChangeText={setYears}
              keyboardType="number-pad"
              style={[styles.input, errors.years ? styles.inputError : null]}
            />
            <FieldError message={errors.years} />

            <Text style={styles.label}>Headline</Text>
            <Text style={styles.helper}>
              One line: who you help and with what. For example, &quot;Employment lawyer. I read
              severance offers before you sign.&quot;
            </Text>
            <TextInput
              placeholder="One sentence on what you offer"
              placeholderTextColor={colors.textMuted}
              value={headline}
              onChangeText={setHeadline}
              style={[styles.input, errors.headline ? styles.inputError : null]}
              maxLength={120}
            />
            <Text style={styles.count}>{headline.length}/120</Text>
            <FieldError message={errors.headline} />
          </>
        ) : null}

        {section === 'topics' ? (
          <>
            <Text style={styles.helper}>
              Write them the way a customer would ask: &quot;Reading a severance offer&quot; says
              more than &quot;Employment law&quot;.
            </Text>
            <View style={styles.topicRow}>
              <TextInput
                placeholder="e.g. Portfolio reviews"
                placeholderTextColor={colors.textMuted}
                value={topicDraft}
                onChangeText={setTopicDraft}
                onSubmitEditing={addTopic}
                returnKeyType="done"
                blurOnSubmit={false}
                style={[styles.input, { flex: 1 }]}
                maxLength={40}
              />
              <Button title="Add" variant="secondary" onPress={addTopic} />
            </View>
            <FieldError message={errors.topics} />
            <View style={styles.topicChips}>
              {topics.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTopics(topics.filter((x) => x !== t))}
                  style={styles.topicChip}
                  accessibilityLabel={`Remove ${t}`}
                >
                  <Text style={styles.topicChipText}>{t}  ✕</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.count}>
              {topics.length}/{MAX_TOPICS}
            </Text>
          </>
        ) : null}

        {section === 'help' ? (
          <>
            <Text style={styles.helper}>
              A formula that works: who you are for, the problems you solve, and what someone
              walks away with after 30 minutes.
            </Text>
            <TextInput
              placeholder={
                'e.g. I help early founders pressure-test their pricing.\n• Who should pay, and how much\n• Reading the first ten sales calls\n• You leave with a price to try this week'
              }
              placeholderTextColor={colors.textMuted}
              value={howICanHelp}
              onChangeText={setHowICanHelp}
              multiline
              style={[styles.input, styles.longInput]}
              maxLength={1500}
            />
            <Text style={styles.count}>{howICanHelp.length}/1500</Text>
          </>
        ) : null}

        {section === 'cover' ? (
          <>
            <Pressable onPress={() => void pickCover()} style={styles.coverPicker}>
              {coverImageUrl ? (
                <Image source={{ uri: coverImageUrl }} style={styles.coverImage} contentFit="cover" />
              ) : (
                <Text style={styles.coverPlaceholder}>
                  {uploadingCover ? 'Uploading…' : 'Tap to choose an image'}
                </Text>
              )}
            </Pressable>
            <FieldError message={errors.cover} />
            {coverImageUrl ? (
              <Button
                title="Remove the cover image"
                variant="ghost"
                onPress={() => setCoverImageUrl('')}
              />
            ) : null}
          </>
        ) : null}

        {section === 'background' ? (
          <>
            <Text style={styles.helper}>Each entry is saved as you add or remove it.</Text>
            <BackgroundEditor entries={existing.credentials} />
            <Button title="Done" onPress={() => router.back()} fullWidth />
          </>
        ) : (
          <>
            {confirmDiscard ? (
              <View style={styles.discard}>
                <Text style={styles.discardText}>You have changes that are not saved.</Text>
                <View style={styles.discardActions}>
                  <Button
                    title="Discard changes"
                    variant="danger"
                    onPress={() => router.back()}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Keep editing"
                    variant="secondary"
                    onPress={() => setConfirmDiscard(false)}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : null}
            <Button
              title={dirty ? 'Save' : 'No changes yet'}
              onPress={onSave}
              loading={isPending}
              disabled={!dirty}
              fullWidth
              style={{ marginTop: spacing.lg }}
            />
            <Button title="Cancel" variant="ghost" onPress={onCancel} fullWidth />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const Chip = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>
);

// The problem is shown right under the field it belongs to.
const FieldError = ({ message }: { message?: string }) =>
  message ? <Text style={styles.error}>{message}</Text> : null;

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  helper: { ...typography.caption, color: colors.textMuted },
  count: { ...typography.caption, color: colors.textMuted, textAlign: 'right' },
  error: { ...typography.caption, color: colors.danger },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: { borderColor: colors.danger, borderWidth: 1 },
  longInput: { minHeight: 180, textAlignVertical: 'top' },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.textPrimary },
  chipText: { ...typography.bodyStrong, color: colors.textPrimary },
  chipTextActive: { color: '#FFFFFF' },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topicChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  topicChip: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  topicChipText: { ...typography.caption, color: colors.accentInk },
  coverPicker: {
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { ...typography.body, color: colors.textMuted },
  discard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.sm,
  },
  discardText: { ...typography.bodyStrong, color: colors.textPrimary },
  discardActions: { flexDirection: 'row', gap: spacing.sm },
});
