import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CredentialBadge } from '@/components/expert/CredentialBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { RatingStars } from '@/components/ui/RatingStars';
import { Screen } from '@/components/ui/Screen';
import { industryById } from '@/constants/industries';
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/hooks/useAuth';
import { useExpert } from '@/hooks/useExperts';
import { useOpenConversation } from '@/hooks/useMessages';
import { useReviewsForExpert } from '@/hooks/useReviews';
import { formatDay } from '@/lib/date';
import { formatCurrency } from '@/lib/format';

export default function ExpertProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: expert, isLoading } = useExpert(id);
  const { data: reviews } = useReviewsForExpert(id);
  const { mutate: openConversation, isPending: openingChat } = useOpenConversation();

  if (isLoading && !expert) return <LoadingView label="Loading expert…" />;
  if (!expert) {
    return (
      <Screen>
        <EmptyState title="Expert not found" emoji="🤷" />
      </Screen>
    );
  }

  const industry = industryById(expert.industryId);
  const hasAvailability =
    expert.availability.length > 0 || expert.availabilityDates.length > 0;
  const isSelf = user?.id === expert.id;

  return (
    <Screen padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {expert.coverImageUrl ? (
          <Image
            source={{ uri: expert.coverImageUrl }}
            style={styles.cover}
            transition={200}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Text style={styles.coverEmoji}>{industry?.emoji ?? '🧠'}</Text>
          </View>
        )}
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

          {expert.ratingCount > 0 ? (
            <RatingStars value={expert.ratingAverage} count={expert.ratingCount} size={18} />
          ) : (
            <Text style={styles.newHere}>New on Human Intelligence</Text>
          )}

          {expert.howICanHelp ? (
            <>
              <Text style={styles.sectionTitle}>How I can help</Text>
              <Text style={styles.bodyText}>{expert.howICanHelp}</Text>
            </>
          ) : null}

          {expert.credentials.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Background</Text>
              <View style={{ gap: spacing.sm }}>
                {expert.credentials.map((c) => (
                  <CredentialBadge key={c.id} credential={c} />
                ))}
              </View>
            </>
          ) : null}

          {expert.bio ? (
            <>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.bodyText}>{expert.bio}</Text>
            </>
          ) : null}

          {reviews && reviews.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>
                Reviews ({expert.ratingCount})
              </Text>
              <View style={{ gap: spacing.sm }}>
                {reviews.map((r) => (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Avatar uri={r.reviewerAvatarUrl} name={r.reviewerName ?? 'Customer'} size={32} />
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
        </View>
      </ScrollView>

      {/* Sticky booking bar — the single CTA for the whole page. */}
      <View style={styles.bookBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bookRate}>{formatCurrency(expert.hourlyRate)}/hr</Text>
          <Text style={styles.bookHint}>
            {isSelf
              ? 'This is your public profile'
              : hasAvailability
                ? '30-minute sessions · video or phone'
                : 'No times available yet'}
          </Text>
        </View>
        {!isSelf && (
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
          title="Book session"
          onPress={() => router.push({ pathname: '/book/[id]', params: { id: expert.id } })}
          disabled={isSelf || !hasAvailability}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxl },
  cover: { width: '100%', height: 220, backgroundColor: colors.surfaceAlt },
  coverFallback: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmoji: { fontSize: 72 },
  body: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.title, color: colors.textPrimary },
  headline: { ...typography.body, color: colors.textSecondary },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  newHere: { ...typography.caption, color: colors.textMuted },
  sectionTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.md },
  bodyText: { ...typography.body, color: colors.textPrimary },
  bookBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    ...shadow.floating,
  },
  bookRate: { ...typography.heading, color: colors.textPrimary },
  bookHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  reviewCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewName: { ...typography.bodyStrong, color: colors.textPrimary },
  reviewDate: { ...typography.caption, color: colors.textMuted },
  reviewComment: { ...typography.body, color: colors.textPrimary },
});
