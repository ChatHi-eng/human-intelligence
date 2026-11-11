import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { RatingStars } from '@/components/ui/RatingStars';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { industryById } from '@/constants/industries';
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/constants/links';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useMyExpertProfile } from '@/hooks/useExperts';
import { formatCurrency } from '@/lib/format';
import { copyExpertShareLink } from '@/lib/share';

export default function YouScreen() {
  const router = useRouter();
  const { user, email, signOut } = useAuth();
  const { data: expertProfile, isLoading: expertLoading } = useMyExpertProfile();

  if (!user) return <LoadingView label="Loading…" />;

  return (
    <Screen>
      <SectionHeader title="You" />

      {/* ---------- Account card ---------- */}
      <Card>
        <View style={styles.accountRow}>
          <Avatar uri={user.avatarUrl} name={user.displayName} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.displayName}</Text>
            <Text style={styles.email}>{email ?? `Account #${user.id.slice(0, 6)}`}</Text>
          </View>
        </View>
        <Button
          title="Edit account"
          variant="secondary"
          onPress={() => router.push('/profile-edit')}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      {/* ---------- Expert card OR Become an expert ---------- */}
      {expertLoading ? null : expertProfile ? (
        <View style={styles.section}>
          <SectionHeader
            title="Your expert profile"
            caption={
              expertProfile.status === 'approved'
                ? 'Customers see this on Discover.'
                : expertProfile.status === 'pending'
                  ? 'Application under review — not on Discover yet.'
                  : 'Application closed — not visible on Discover.'
            }
          />
          <Card>
            <View style={styles.expertHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.expertHeadline}>{expertProfile.headline}</Text>
                <Text style={styles.expertMeta}>
                  {expertProfile.hourlyRate !== null
                    ? `${formatCurrency(expertProfile.hourlyRate)}/hr`
                    : 'Rate coming soon'}{' '}
                  · {expertProfile.yearsExperience}y experience
                </Text>
                <View style={styles.expertBadgeRow}>
                  {industryById(expertProfile.industryId) && (
                    <Badge
                      label={`${industryById(expertProfile.industryId)?.emoji}  ${
                        industryById(expertProfile.industryId)?.label
                      }`}
                      tone="neutral"
                    />
                  )}
                  {expertProfile.verified && <Badge label="Verified" tone="success" />}
                  <Badge
                    label={
                      expertProfile.stripeConnectPayoutsEnabled ? 'Payouts on' : 'Payouts pending'
                    }
                    tone={expertProfile.stripeConnectPayoutsEnabled ? 'success' : 'warning'}
                  />
                </View>
                {expertProfile.ratingCount > 0 ? (
                  <RatingStars
                    value={expertProfile.ratingAverage}
                    count={expertProfile.ratingCount}
                  />
                ) : (
                  <Text style={styles.emptyRating}>No reviews yet</Text>
                )}
              </View>
            </View>
            <View style={styles.expertActions}>
              <Button
                title="Edit expert profile"
                variant="secondary"
                onPress={() => router.push('/expert-profile-edit')}
                style={{ flex: 1 }}
              />
              <Button
                title="Preview"
                variant="ghost"
                onPress={() => router.push(`/expert/${expertProfile.id}`)}
                style={{ flex: 1 }}
              />
            </View>
            {/* Share only works once approved — anon RLS hides other rows. */}
            {expertProfile.status === 'approved' && (
              <Button
                title="Share your profile"
                onPress={() => void copyExpertShareLink(expertProfile.id)}
                style={{ marginTop: spacing.sm }}
              />
            )}
          </Card>
        </View>
      ) : (
        <View style={styles.section}>
          <Card>
            <Text style={styles.becomeTitle}>People pay for what you know</Text>
            <Text style={styles.becomeBody}>
              Years of experience in anything — law, code, pipes, paint — is worth real money to
              someone stuck. Set up your expert profile and start taking bookings.
            </Text>
            <Button
              title="Become an expert"
              onPress={() => router.push('/expert-onboarding')}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </View>
      )}

      {/* ---------- Support & legal ---------- */}
      <View style={styles.section}>
        <SectionHeader title="Support" />
        <Card>
          <View style={styles.supportRow}>
            <Text style={styles.supportLabel}>Help &amp; contact</Text>
            <Text style={styles.supportEmail} selectable>
              {SUPPORT_EMAIL}
            </Text>
          </View>
          <View style={styles.supportDivider} />
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
            style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}
          >
            <Text style={styles.supportLabel}>Terms</Text>
            <Text style={styles.supportHint}>↗</Text>
          </Pressable>
          <View style={styles.supportDivider} />
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
            style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}
          >
            <Text style={styles.supportLabel}>Privacy</Text>
            <Text style={styles.supportHint}>↗</Text>
          </Pressable>
        </Card>
      </View>

      {/* ---------- Sign out / delete ---------- */}
      <View style={styles.section}>
        <Button title="Sign out" onPress={() => void signOut()} variant="ghost" />
        <Pressable
          onPress={() => router.push('/delete-account')}
          style={({ pressed }) => [styles.deleteEntry, pressed && styles.deleteEntryPressed]}
        >
          <Text style={styles.deleteText}>Delete account</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { ...typography.heading, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  section: { marginTop: spacing.xl },
  expertHeader: { gap: spacing.sm },
  expertHeadline: { ...typography.bodyStrong, color: colors.textPrimary },
  expertMeta: { ...typography.caption, color: colors.textSecondary },
  expertBadgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  emptyRating: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  expertActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  becomeTitle: { ...typography.heading, color: colors.textPrimary },
  becomeBody: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  supportRowPressed: { opacity: 0.6 },
  supportLabel: { ...typography.body, color: colors.textPrimary },
  supportEmail: { ...typography.caption, color: colors.textSecondary },
  supportHint: { ...typography.caption, color: colors.textMuted },
  supportDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  deleteEntry: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  deleteEntryPressed: { opacity: 0.6 },
  deleteText: { ...typography.caption, color: colors.danger },
});
