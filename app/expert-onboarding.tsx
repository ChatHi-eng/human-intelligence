import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import {
  industries,
  industryById,
  industryDisplay,
  OTHER_INDUSTRY_ID,
} from '@/constants/industries';
import { EXPERT_KEEP_PCT } from '@/constants/business';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useMyExpertProfile, useUpsertMyExpertProfile } from '@/hooks/useExperts';
import { useUpdateMyProfile, useUploadImage, useUploadResume } from '@/hooks/useProfile';
import { capture } from '@/services/analytics';
import { formatCurrency } from '@/lib/format';

// Light steps in confidence order: easy taps first, writing in the middle,
// money near the end, then a review pass before anything is submitted.
const STEPS = ['Field', 'Experience', 'Pitch', 'Rate', 'Photo', 'Review'] as const;

const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_RESUME_BYTES = 10 * 1024 * 1024; // matches the bucket's 10 MB limit
const MAX_TOPICS = 6;

export default function ExpertOnboardingScreen() {
  const router = useRouter();
  const { data: existing, isLoading } = useMyExpertProfile();
  const { mutate: upsert, isPending: saving } = useUpsertMyExpertProfile();
  const { mutateAsync: upload, isPending: uploading } = useUploadImage();
  const { mutateAsync: uploadResumeFile, isPending: uploadingResume } = useUploadResume();
  const { mutateAsync: updateProfile } = useUpdateMyProfile();

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [industryId, setIndustryId] = useState('');
  const [industrySearch, setIndustrySearch] = useState('');
  const [industryCustom, setIndustryCustom] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState('');
  const [years, setYears] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [resumePath, setResumePath] = useState('');
  const [resumeName, setResumeName] = useState('');
  const [headline, setHeadline] = useState('');
  const [howICanHelp, setHowICanHelp] = useState('');
  const [rateDollars, setRateDollars] = useState('');
  const [decideLater, setDecideLater] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [applicationGoal, setApplicationGoal] = useState('');

  // Funnel entry — fires once per wizard mount, only for genuinely new
  // applicants (returning applicants are redirected away below).
  const startedTracked = useRef(false);
  useEffect(() => {
    if (!isLoading && !existing && !startedTracked.current) {
      startedTracked.current = true;
      capture('application_started');
    }
  }, [isLoading, existing]);

  if (isLoading) return <LoadingView label="Loading…" />;
  // Already applied → this wizard isn't for you. Approved experts edit their
  // live profile; pending/rejected applicants see their status in Studio.
  if (existing && !done) {
    return (
      <Redirect href={existing.status === 'approved' ? '/expert-profile-edit' : '/(tabs)/studio'} />
    );
  }

  const industry = industryById(industryId);
  const isOther = industryId === OTHER_INDUSTRY_ID;
  const fieldDisplay = industryDisplay(industryId, industryCustom);
  const searchNeedle = industrySearch.trim().toLowerCase();
  const visibleIndustries = searchNeedle
    ? industries.filter((i) => i.label.toLowerCase().includes(searchNeedle))
    : industries;

  const addTopic = () => {
    const next = topicDraft.trim().replace(/,+$/, '');
    if (!next) return;
    if (topics.length >= MAX_TOPICS) {
      Toast.show({ type: 'error', text1: `Up to ${MAX_TOPICS} topics` });
      return;
    }
    if (!topics.some((t) => t.toLowerCase() === next.toLowerCase())) {
      setTopics([...topics, next]);
    }
    setTopicDraft('');
  };

  // Discover features the profile photo, so that's what the wizard asks for.
  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Photo permission needed' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    try {
      const url = await upload({
        bucket: 'avatars',
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      await updateProfile({ avatarUrl: url });
      setAvatarUrl(url);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  // Resume goes straight into the private bucket; we keep the storage path
  // for the application row and the filename for the UI.
  const pickResume = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: RESUME_MIME_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (asset.size != null && asset.size > MAX_RESUME_BYTES) {
      Toast.show({ type: 'error', text1: 'File too large', text2: 'Resumes can be up to 10 MB.' });
      return;
    }
    try {
      const path = await uploadResumeFile({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'application/pdf',
      });
      setResumePath(path);
      setResumeName(asset.name);
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
    if (step === 0 && isOther && !industryCustom.trim()) {
      Toast.show({ type: 'error', text1: 'Type your field' });
      return false;
    }
    if (step === 1) {
      const y = Number(years);
      if (years.trim() === '' || !Number.isFinite(y) || y < 0) {
        Toast.show({ type: 'error', text1: 'Years of experience must be 0 or more' });
        return false;
      }
      if (!linkedinUrl.trim() && !resumePath) {
        Toast.show({
          type: 'error',
          text1: 'Add your LinkedIn or a resume',
          text2: 'We verify every expert, so we need at least one.',
        });
        return false;
      }
    }
    if (step === 2 && !headline.trim()) {
      Toast.show({ type: 'error', text1: 'Write a headline' });
      return false;
    }
    if (step === 3 && !decideLater) {
      const rate = Number(rateDollars);
      if (!Number.isFinite(rate) || rate <= 0) {
        Toast.show({
          type: 'error',
          text1: 'Set an hourly rate',
          text2: 'Or choose "I\'ll decide later" below.',
        });
        return false;
      }
    }
    if (step === 5 && !applicationGoal.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Tell us what you have to offer',
        text2: 'A few sentences on the value you bring.',
      });
      return false;
    }
    return true;
  };

  const onNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      capture('application_step_completed', {
        step_name: STEPS[step] ?? 'unknown',
        step_index: step,
      });
      setStep(step + 1);
      return;
    }
    // Final step → submit the application (new rows start status='pending').
    upsert(
      {
        industryId,
        headline: headline.trim(),
        hourlyRateCents: decideLater ? null : Math.round(Number(rateDollars) * 100),
        yearsExperience: Math.floor(Number(years)),
        howICanHelp: howICanHelp.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        resumeUrl: resumePath || null,
        applicationGoal: applicationGoal.trim() || null,
        industryCustom: isOther ? industryCustom.trim() : null,
        currentTitle: currentTitle.trim() || null,
        currentCompany: currentCompany.trim() || null,
        topics,
      },
      {
        onSuccess: () => {
          capture('application_submitted', {
            industry_id: industryId,
            has_resume: Boolean(resumePath),
            has_linkedin: Boolean(linkedinUrl.trim()),
            rate_decided: !decideLater,
          });
          setDone(true);
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

  if (done) {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>📨</Text>
          <Text style={styles.doneTitle}>Application received</Text>
          <Text style={styles.doneBody}>
            A person on our team reads every application. You&apos;ll hear back within 2 to 3
            days. Once you&apos;re approved, your Studio unlocks and you can open up availability.
          </Text>
          <Button title="Go to Studio" onPress={() => router.replace('/(tabs)/studio')} fullWidth />
        </View>
      </Screen>
    );
  }

  const suggested = industry?.suggestedRateCents;
  const suggestedChips = suggested
    ? [
        suggested.min / 100,
        Math.round((suggested.min + suggested.max) / 200 / 25) * 25,
        suggested.max / 100,
      ].filter((v, i, arr) => arr.indexOf(v) === i)
    : [];

  return (
    <Screen>
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <>
            <Text style={styles.title}>What&apos;s your field?</Text>
            <Text style={styles.caption}>
              Search or pick the closest fit. Not listed? Choose &quot;Something else&quot; and
              type your own. The application takes about four minutes, and a real person reads
              every one.
            </Text>
            <TextInput
              placeholder="Search fields (try law, design, finance)"
              placeholderTextColor={colors.textMuted}
              value={industrySearch}
              onChangeText={setIndustrySearch}
              autoCorrect={false}
              style={styles.input}
            />
            <View style={styles.industryGrid}>
              {visibleIndustries.map((i) => {
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
              <Pressable
                onPress={() => {
                  setIndustryId(OTHER_INDUSTRY_ID);
                  // Carry a search that matched nothing straight into the field.
                  if (!industryCustom && visibleIndustries.length === 0) {
                    setIndustryCustom(industrySearch.trim());
                  }
                }}
                style={[styles.industryTile, isOther && styles.industryTileActive]}
              >
                <Text style={styles.industryEmoji}>✨</Text>
                <Text style={[styles.industryLabel, isOther && styles.industryLabelActive]}>
                  Something else
                </Text>
              </Pressable>
            </View>
            {isOther && (
              <>
                <Text style={styles.label}>Your field</Text>
                <TextInput
                  placeholder="e.g. Veterinary medicine, Aviation, Wine"
                  placeholderTextColor={colors.textMuted}
                  value={industryCustom}
                  onChangeText={setIndustryCustom}
                  style={styles.input}
                  maxLength={60}
                  autoFocus
                />
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>Your background</Text>
            <Text style={styles.caption}>
              This is what our review team weighs most. Share your LinkedIn or upload a resume.
              We need at least one to verify your experience.
            </Text>
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
              style={styles.input}
            />
            <Text style={styles.label}>LinkedIn URL</Text>
            <TextInput
              placeholder="https://linkedin.com/in/you"
              placeholderTextColor={colors.textMuted}
              value={linkedinUrl}
              onChangeText={setLinkedinUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
              maxLength={300}
            />
            <Text style={styles.label}>Resume</Text>
            <Pressable
              onPress={pickResume}
              style={[styles.resumeRow, resumePath ? styles.resumeRowDone : null]}
            >
              <Text style={styles.resumeIcon}>{resumePath ? '📄' : '📎'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle} numberOfLines={1}>
                  {uploadingResume
                    ? 'Uploading…'
                    : resumePath
                      ? resumeName
                      : 'Upload your resume'}
                </Text>
                <Text style={styles.resumeHint}>
                  {resumePath ? 'Tap to replace' : 'PDF or Word, up to 10 MB'}
                </Text>
              </View>
            </Pressable>
            <Text style={styles.privacyNote}>
              Your resume goes to our review team only. Customers never see it.
            </Text>
          </>
        )}

        {step === 2 && (
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
              placeholder={
                'Who are you for, and what problems do you solve?\n• 1:1 strategy calls\n• Portfolio reviews'
              }
              placeholderTextColor={colors.textMuted}
              value={howICanHelp}
              onChangeText={setHowICanHelp}
              multiline
              style={[styles.input, styles.longInput]}
              maxLength={1500}
            />
            <Text style={styles.label}>Topics you can help with (up to {MAX_TOPICS})</Text>
            <Text style={styles.privacyNote}>
              The specific things people can ask you about. These show as tags on your profile
              and help customers find you in search.
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
            {topics.length > 0 && (
              <View style={styles.topicChips}>
                {topics.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setTopics(topics.filter((x) => x !== t))}
                    style={styles.topicChip}
                  >
                    <Text style={styles.topicChipText}>{t}  ✕</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Set your hourly rate</Text>
            <Text style={styles.caption}>
              Sessions are 30 minutes, so customers pay half your hourly rate per session. You
              keep {EXPERT_KEEP_PCT}% of each session and Palam keeps the rest. You can change your
              rate anytime.
            </Text>
            {suggested && industry ? (
              <View style={styles.ratePanel}>
                <Text style={styles.ratePanelTitle}>
                  Typical for {industry.label}: {formatCurrency(suggested.min)} to{' '}
                  {formatCurrency(suggested.max)}/hr
                </Text>
                <Text style={styles.ratePanelHint}>
                  This is only a guide. Advice calls usually price above your day rate.
                </Text>
                <View style={styles.rateChips}>
                  {suggestedChips.map((v) => {
                    const active = !decideLater && Number(rateDollars) === v;
                    return (
                      <Pressable
                        key={v}
                        onPress={() => {
                          setRateDollars(String(v));
                          setDecideLater(false);
                        }}
                        style={[styles.rateChip, active && styles.rateChipActive]}
                      >
                        <Text style={[styles.rateChipText, active && styles.rateChipTextActive]}>
                          ${v}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <Text style={styles.label}>Hourly rate (USD)</Text>
            <TextInput
              placeholder="150"
              placeholderTextColor={colors.textMuted}
              value={rateDollars}
              onChangeText={(v) => {
                setRateDollars(v);
                if (v.trim() !== '') setDecideLater(false);
              }}
              keyboardType="decimal-pad"
              style={[styles.input, decideLater && styles.inputDimmed]}
            />
            <Pressable
              onPress={() => setDecideLater(!decideLater)}
              style={[styles.decideLater, decideLater && styles.decideLaterActive]}
            >
              <Text style={styles.decideLaterCheck}>{decideLater ? '✓' : ''}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.decideLaterTitle}>I&apos;ll decide later</Text>
                <Text style={styles.decideLaterHint}>
                  Apply without a rate. Your profile shows &quot;Rate coming soon&quot; and you can
                  set it in Studio whenever you&apos;re ready.
                </Text>
              </View>
            </Pressable>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>Add a profile photo</Text>
            <Text style={styles.caption}>
              Your photo is the first thing customers see on Discover. You can skip this step,
              but we recommend adding one.
            </Text>
            <View style={styles.photoRow}>
              <Pressable onPress={pickPhoto} style={styles.photoPicker}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.photoImage} contentFit="cover" />
                ) : (
                  <Text style={styles.photoPlaceholder}>
                    {uploading ? 'Uploading…' : 'Tap to add'}
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.title}>Before you submit</Text>
            <Text style={styles.caption}>
              One last question for our review team, then check that everything reads the way you
              want.
            </Text>
            <Text style={styles.label}>What expertise do you have to offer?</Text>
            <Text style={styles.privacyNote}>
              Your pitch to our review team: the value you bring, how you deliver it, and the
              kinds of customers you can serve. It never appears on your profile.
            </Text>
            <TextInput
              placeholder="e.g. 15 years shipping consumer products. I can help early-career designers with portfolio reviews, interview prep, and getting unstuck on real projects."
              placeholderTextColor={colors.textMuted}
              value={applicationGoal}
              onChangeText={setApplicationGoal}
              multiline
              style={[styles.input, styles.goalInput]}
              maxLength={500}
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Your application</Text>
            <View style={styles.summaryCard}>
              <SummaryRow
                label="Field"
                value={fieldDisplay ? `${fieldDisplay.emoji} ${fieldDisplay.label}` : '—'}
                onEdit={() => setStep(0)}
              />
              <SummaryRow
                label="Background"
                value={[
                  currentTitle.trim() || null,
                  `${years || '0'} yrs`,
                  linkedinUrl.trim() ? 'LinkedIn ✓' : null,
                  resumePath ? 'Resume ✓' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onEdit={() => setStep(1)}
              />
              <SummaryRow label="Headline" value={headline || '—'} onEdit={() => setStep(2)} />
              <SummaryRow
                label="Topics"
                value={topics.length > 0 ? topics.join(', ') : 'None added'}
                onEdit={() => setStep(2)}
              />
              <SummaryRow
                label="Rate"
                value={
                  decideLater
                    ? 'Deciding later'
                    : rateDollars
                      ? `$${rateDollars}/hr`
                      : '—'
                }
                onEdit={() => setStep(3)}
              />
              <SummaryRow
                label="Photo"
                value={avatarUrl ? 'Added ✓' : 'Not added'}
                onEdit={() => setStep(4)}
                last
              />
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button
            title="Back"
            variant="ghost"
            onPress={() => setStep(step - 1)}
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => {
              capture('application_cancelled');
              router.back();
            }}
            style={{ flex: 1 }}
          />
        )}
        <Button
          title={step === STEPS.length - 1 ? 'Submit application' : 'Next'}
          onPress={onNext}
          loading={saving}
          style={{ flex: 2 }}
        />
      </View>
    </Screen>
  );
}

const SummaryRow = ({
  label,
  value,
  onEdit,
  last,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  last?: boolean;
}) => (
  <Pressable onPress={onEdit} style={[styles.summaryRow, !last && styles.summaryRowBorder]}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue} numberOfLines={2}>
      {value}
    </Text>
    <Text style={styles.summaryEdit}>Edit</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  progressWrap: { paddingTop: spacing.lg, gap: spacing.sm },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  progressText: { ...typography.label, color: colors.textSecondary },
  scroll: { paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  caption: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  privacyNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
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
  inputDimmed: { opacity: 0.4 },
  longInput: { minHeight: 140, textAlignVertical: 'top' },
  goalInput: { minHeight: 110, textAlignVertical: 'top' },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  topicChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  topicChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  topicChipText: { ...typography.caption, color: colors.accent },
  industryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
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
  industryLabel: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center' },
  industryLabelActive: { color: '#FFFFFF' },
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  resumeRowDone: {
    borderStyle: 'solid',
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  resumeIcon: { fontSize: 22 },
  resumeTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  resumeHint: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  ratePanel: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  ratePanelTitle: { ...typography.bodyStrong, color: colors.accent },
  ratePanelHint: { ...typography.caption, color: colors.textSecondary },
  rateChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  rateChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rateChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rateChipText: { ...typography.bodyStrong, color: colors.textPrimary },
  rateChipTextActive: { color: '#FFFFFF' },
  decideLater: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  decideLaterActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  decideLaterCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.accent,
    color: colors.accent,
    textAlign: 'center',
    lineHeight: 21,
    fontSize: 14,
    overflow: 'hidden',
  },
  decideLaterTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  decideLaterHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  photoRow: { alignItems: 'center', paddingVertical: spacing.lg },
  photoPicker: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoPlaceholder: { ...typography.body, color: colors.accent },
  summaryCard: {
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryLabel: { ...typography.label, color: colors.textSecondary, width: 86 },
  summaryValue: { ...typography.body, color: colors.textPrimary, flex: 1 },
  summaryEdit: { ...typography.label, color: colors.accent },
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
