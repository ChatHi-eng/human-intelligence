import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { CredentialBadge } from '@/components/expert/CredentialBadge';
import { ExpertCard } from '@/components/expert/ExpertCard';
import { Avatar, Portrait } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LoadingView } from '@/components/ui/LoadingView';
import { RatingStars } from '@/components/ui/RatingStars';
import { Screen } from '@/components/ui/Screen';
import { MIN_REVIEWS_FOR_RATING } from '@/constants/business';
import {
  CUSTOMER_BOOKING_ENABLED,
  MESSAGING_ENABLED,
  PHONE_SESSIONS_ENABLED,
} from '@/constants/featureFlags';
import { industryDisplay } from '@/constants/industries';
import { colors, fonts, radius, shadow, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useExpert } from '@/hooks/useExperts';
import { useOpenConversation } from '@/hooks/useMessages';
import { useReviewsForExpert } from '@/hooks/useReviews';
import { formatDay } from '@/lib/date';
import { nextOpening, openingLabel } from '@/lib/discover';
import { formatCurrency, formatRating } from '@/lib/format';
import { capture } from '@/services/analytics';

// The sections an expert can edit from their own profile. Each opens a small
// screen with its own Save (app/expert-profile-edit.tsx).
type EditSection = 'identity' | 'topics' | 'help' | 'background' | 'cover';

export default function ExpertProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: expert, isLoading } = useExpert(id);
  const { data: reviews } = useReviewsForExpert(id);
  const { mutate: openConversation, isPending: openingChat } = useOpenConversation();
  const [showVerified, setShowVerified] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // Only count views of profiles that actually render (approved, or own preview).
  const viewableExpertId =
    expert && (expert.status === 'approved' || user?.id === expert.id) ? expert.id : null;
  const viewerIsOwner = Boolean(expert && user?.id === expert.id);
  useEffect(() => {
    // An expert looking at their own page is not a customer view.
    if (viewableExpertId && !viewerIsOwner) {
      capture('expert_profile_viewed', { expert_id: viewableExpertId });
    }
  }, [viewableExpertId, viewerIsOwner]);

  if (isLoading && !expert) return <LoadingView label="Loading expert…" />;
  // Unapproved experts are invisible to everyone but themselves (so an
  // applicant can still preview their own profile while under review).
  if (!expert || (expert.status !== 'approved' && user?.id !== expert.id)) {
    return (
      <Screen>
        <EmptyState title="Expert not found" icon="help-circle" />
      </Screen>
    );
  }

  const industry = industryDisplay(expert.industryId, expert.industryCustom);
  const roleLine = [expert.currentTitle, expert.currentCompany].filter(Boolean).join(' at ');
  // The same rule the booking screen uses, so the Book bar never promises a
  // time that screen will not offer.
  const opening = nextOpening(expert);
  const isSelf = viewerIsOwner;
  const firstName = expert.displayName.split(' ')[0] ?? expert.displayName;
  const edit = (section: EditSection) =>
    router.push({ pathname: '/expert-profile-edit', params: { section } });

  return (
    <Screen padded={false}>
      {/* The way back floats at the top, over the cover image when there is one. */}
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.back}
        accessibilityLabel="Back"
        hitSlop={8}
      >
        <Icon name="arrow-left" size={20} color={colors.textPrimary} />
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View>
          {expert.coverImageUrl ? (
            <Image
              source={{ uri: expert.coverImageUrl }}
              style={styles.cover}
              transition={200}
              contentFit="cover"
            />
          ) : (
            // No cover image: leave room for the back button. The person's
            // photo sits beside their name below, whole and square.
            <View style={styles.noCover} />
          )}
          {isSelf ? (
            <Pressable
              onPress={() => edit('cover')}
              style={styles.coverEdit}
              accessibilityLabel="Edit cover image"
            >
              <Text style={styles.coverEditText}>
                {expert.coverImageUrl ? 'Change cover' : 'Add a cover image'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.body}>
          {isSelf ? (
            <View style={styles.ownerCard}>
              <Text style={styles.ownerTitle}>This is what customers see</Text>
              <Text style={styles.ownerBody}>
                Tap Edit beside any section to change it. Changes go live as soon as you save.
                {expert.status === 'pending' ? ' Your profile appears on Discover once approved.' : ''}
              </Text>
              <View style={styles.ownerActions}>
                <Button
                  title={showCard ? 'Hide Discover card' : 'Preview Discover card'}
                  variant="secondary"
                  onPress={() => setShowCard((v) => !v)}
                />
                <Button
                  title="Session settings"
                  variant="secondary"
                  onPress={() => router.push('/studio/session-settings')}
                />
              </View>
              {showCard ? (
                <View style={styles.cardPreview}>
                  <ExpertCard expert={expert} />
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.headerRow}>
            {/* Profile photos are square, so the photo is shown square and
                whole, never stretched across the screen. */}
            <Pressable
              disabled={!isSelf}
              onPress={() => router.push('/profile-edit')}
              accessibilityLabel={isSelf ? 'Change your photo' : undefined}
              style={styles.photo}
            >
              <Portrait uri={expert.avatarUrl} name={expert.displayName} height={PROFILE_PHOTO} />
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{expert.displayName}</Text>
              {roleLine ? <Text style={styles.roleLine}>{roleLine}</Text> : null}
              {industry ? (
                <View style={styles.fieldRow}>
                  <Icon name={industry.icon} size={16} color={colors.textSecondary} />
                  <Text style={styles.fieldText}>{industry.label}</Text>
                </View>
              ) : null}
            </View>
            {isSelf ? <EditLink label="Edit who you are" onPress={() => edit('identity')} /> : null}
          </View>

          {/* Three facts people look for first, side by side. */}
          <View style={styles.stats}>
            <View style={styles.stat}>
              {expert.ratingCount >= MIN_REVIEWS_FOR_RATING ? (
                <>
                  <Text style={styles.statValue}>★ {formatRating(expert.ratingAverage)}</Text>
                  <Text style={styles.statLabel}>
                    {expert.ratingCount} review{expert.ratingCount === 1 ? '' : 's'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.statValue}>New</Text>
                  <Text style={styles.statLabel}>on Palam</Text>
                </>
              )}
            </View>
            <View style={[styles.stat, styles.statDivided]}>
              <Text style={styles.statValue}>{expert.yearsExperience}</Text>
              <Text style={styles.statLabel}>
                year{expert.yearsExperience === 1 ? '' : 's'} of experience
              </Text>
            </View>
            {expert.verified ? (
              <Pressable
                style={[styles.stat, styles.statDivided]}
                onPress={() => setShowVerified((v) => !v)}
                accessibilityLabel="What vetted means"
              >
                <Icon name="check-circle" size={20} color={colors.accent} />
                <Text style={[styles.statLabel, styles.statLink]}>Vetted by Palam</Text>
              </Pressable>
            ) : null}
          </View>
          {showVerified ? (
            <Text style={styles.explainer}>
              Vetted means a person at Palam read this expert&apos;s application and checked
              their LinkedIn profile or resume before they were listed.
            </Text>
          ) : null}

          <Text style={styles.headline}>{expert.headline}</Text>
          {expert.introEnabled && !expert.paused ? (
            <View style={styles.fieldRow}>
              <Icon name="gift" size={16} color={colors.accentInk} />
              <Text style={styles.introText}>Free 15-minute intro call</Text>
            </View>
          ) : null}

          {expert.topics.length > 0 || isSelf ? (
            <>
              <SectionHead title="Ask me about" onEdit={isSelf ? () => edit('topics') : undefined} />
              {expert.topics.length > 0 ? (
                <View style={styles.badgeRow}>
                  {expert.topics.map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.prompt}>
                  Add the specific things people can ask you about. They show here as tags and help
                  customers find you.
                </Text>
              )}
            </>
          ) : null}

          {expert.howICanHelp || isSelf ? (
            <>
              <SectionHead title="How I can help" onEdit={isSelf ? () => edit('help') : undefined} />
              {expert.howICanHelp ? (
                <Text style={styles.bodyText}>{expert.howICanHelp}</Text>
              ) : (
                <Text style={styles.prompt}>
                  Say who you are for and what problems you solve. This is the part customers read
                  most closely.
                </Text>
              )}
            </>
          ) : null}

          <SectionHead title="What to expect" />
          <Text style={styles.bodyText}>
            A 30-minute video call with {firstName}, one to one, inside the Palam app. You write
            what you want to talk about when you book, so the call starts on your question.
            {expert.introEnabled && !expert.paused
              ? ` New to ${firstName}? You can start with a free 15-minute intro call.`
              : ''}
          </Text>

          {reviews && reviews.length > 0 ? (
            <>
              <SectionHead title={`Reviews (${expert.ratingCount})`} />
              <View style={{ gap: spacing.sm }}>
                {reviews.map((r) => (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Avatar
                        uri={r.reviewerAvatarUrl}
                        name={r.reviewerName ?? 'Customer'}
                        size={32}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewName}>{r.reviewerName ?? 'Customer'}</Text>
                        <Text style={styles.reviewDate}>{formatDay(r.createdAt)}</Text>
                      </View>
                      <RatingStars value={r.rating} size={14} />
                    </View>
                    {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {expert.credentials.length > 0 || isSelf ? (
            <>
              <SectionHead
                title="Background"
                onEdit={isSelf ? () => edit('background') : undefined}
              />
              {expert.credentials.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  {expert.credentials.map((c) => (
                    <CredentialBadge key={c.id} credential={c} />
                  ))}
                </View>
              ) : (
                <Text style={styles.prompt}>
                  Add the jobs, education and certifications that back up what you offer.
                </Text>
              )}
            </>
          ) : null}

          {expert.bio ? (
            <>
              <SectionHead title="About" />
              <Text style={styles.bodyText}>{expert.bio}</Text>
            </>
          ) : null}

          <Text style={styles.policy}>
            Cancelling is free until 24 hours before a session. If {firstName} cancels, you are
            refunded in full.
          </Text>
        </View>
      </ScrollView>

      {/* Signed-out viewers (public share links on the web build) get an
          invite-only CTA instead of the booking bar. */}
      {!user ? (
        <View style={styles.bookBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bookRate}>
              {expert.sessionPrice !== null ? (
                <>
                  {formatCurrency(expert.sessionPrice)}{' '}
                  <Text style={styles.bookUnit}>per session</Text>
                </>
              ) : (
                'Price coming soon'
              )}
            </Text>
            <Text style={styles.bookHint}>Create an account to book</Text>
          </View>
          <Button
            title="Sign up to book"
            onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'signup' } })}
          />
        </View>
      ) : (
        CUSTOMER_BOOKING_ENABLED && (
          <View style={styles.bookBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bookRate}>
                {expert.sessionPrice !== null ? (
                  <>
                    {formatCurrency(expert.sessionPrice)}{' '}
                    <Text style={styles.bookUnit}>per session</Text>
                  </>
                ) : (
                  'Price coming soon'
                )}
              </Text>
              <Text style={styles.bookHint}>
                {isSelf
                  ? 'This is your public profile'
                  : expert.paused
                    ? 'Not taking bookings right now'
                    : expert.sessionPrice === null
                      ? expert.introEnabled
                        ? 'Free 15-minute intro available'
                        : 'Booking opens once a price is set'
                      : opening
                        ? `${openingLabel(opening)} · ${
                            PHONE_SESSIONS_ENABLED ? 'video or phone' : '30-minute video call'
                          }`
                        : 'No times available yet'}
              </Text>
            </View>
            {!isSelf && MESSAGING_ENABLED && (
              <Button
                title="Message"
                variant="secondary"
                loading={openingChat}
                onPress={() => {
                  if (!user) return;
                  openConversation(
                    { customerId: user.id, expertId: expert.id },
                    {
                      onSuccess: (conversationId) =>
                        router.push({ pathname: '/chat/[id]', params: { id: conversationId } }),
                      onError: (err) =>
                        Toast.show({
                          type: 'error',
                          text1: 'Could not open chat',
                          text2: err instanceof Error ? err.message : 'Unknown error',
                        }),
                    },
                  );
                }}
              />
            )}
            <Button
              title={expert.sessionPrice === null && expert.introEnabled ? 'Book intro' : 'Book'}
              onPress={() => router.push({ pathname: '/book/[id]', params: { id: expert.id } })}
              disabled={
                isSelf ||
                expert.paused ||
                // Bookable with an open paid time, or with a free intro on offer.
                !(opening || expert.introEnabled)
              }
            />
          </View>
        )
      )}
    </Screen>
  );
}

// The size of the photo beside the name at the top of a profile.
const PROFILE_PHOTO = 120;

const SectionHead = ({ title, onEdit }: { title: string; onEdit?: () => void }) => (
  <View style={styles.sectionHead}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {onEdit ? <EditLink label={`Edit ${title}`} onPress={onEdit} /> : null}
  </View>
);

const EditLink = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={12} accessibilityLabel={label}>
    <Text style={styles.editLink}>Edit</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  back: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  cover: { width: '100%', height: 260, backgroundColor: colors.surfaceAlt },
  coverEdit: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  coverEditText: { ...typography.label, color: colors.textPrimary },
  body: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.lg },
  ownerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  ownerTitle: { ...typography.heading, color: colors.textPrimary },
  ownerBody: { ...typography.body, color: colors.textSecondary },
  ownerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  cardPreview: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  noCover: { height: 56 },
  photo: { width: PROFILE_PHOTO, height: PROFILE_PHOTO },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { ...typography.title, color: colors.textPrimary },
  headline: { ...typography.body, fontSize: 16, lineHeight: 24, color: colors.textPrimary },
  roleLine: { ...typography.body, color: colors.textSecondary },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldText: { ...typography.body, color: colors.textSecondary },
  introText: { ...typography.bodyStrong, color: colors.accentInk },
  stats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: spacing.xs },
  statDivided: { borderLeftWidth: 1, borderLeftColor: colors.border },
  statValue: { ...typography.heading, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  statLink: { textDecorationLine: 'underline' },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tagText: { ...typography.body, color: colors.textPrimary },
  explainer: { ...typography.caption, color: colors.textSecondary },
  newHere: { ...typography.caption, color: colors.textMuted },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: { ...typography.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  editLink: { ...typography.bodyStrong, color: colors.textPrimary, textDecorationLine: 'underline' },
  prompt: { ...typography.body, color: colors.textMuted },
  bodyText: { ...typography.body, color: colors.textPrimary },
  policy: { ...typography.caption, color: colors.textMuted, marginTop: spacing.lg },
  bookBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  bookRate: { ...typography.heading, color: colors.textPrimary },
  bookUnit: { ...typography.body, fontFamily: fonts.regular, color: colors.textSecondary },
  bookHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  reviewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewName: { ...typography.bodyStrong, color: colors.textPrimary },
  reviewDate: { ...typography.caption, color: colors.textMuted },
  reviewComment: { ...typography.body, color: colors.textPrimary },
});
