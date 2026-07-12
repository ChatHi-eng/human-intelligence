import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { RatingStars } from '@/components/ui/RatingStars';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { industryById } from '@/constants/industries';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useMyExpertProfile } from '@/hooks/useExperts';
import { formatCurrency } from '@/lib/format';

export default function YouScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
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
            <Text style={styles.email}>{userLabel(user)}</Text>
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
          <SectionHeader title="Your expert profile" caption="Customers see this on Discover." />
          <Card>
            <View style={styles.expertHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.expertHeadline}>{expertProfile.headline}</Text>
                <Text style={styles.expertMeta}>
                  {formatCurrency(expertProfile.hourlyRate)}/hr · {expertProfile.yearsExperience}y
                  experience
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
                      expertProfile.stripeConnectPayoutsEnabled
                        ? 'Payouts on'
                        : 'Payouts pending'
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

      {/* ---------- Sign out ---------- */}
      <View style={styles.section}>
        <Button title="Sign out" onPress={() => void signOut()} variant="ghost" />
      </View>
    </Screen>
  );
}

function userLabel(user: { displayName: string; id: string }): string {
  // Placeholder for showing email; auth store already resolves displayName from
  // profile.display_name, so email lives on user.email in the underlying session.
  // The Profile type here doesn't carry email, so show a subdued placeholder for now.
  return `Account #${user.id.slice(0, 6)}`;
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { ...typography.heading, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  section: { marginTop: spacing.xl },
  expertHeader: { gap: spacing.sm },
  expertHeadline: { ...typography.bodyStrong, color: colors.textPrimary },
  expertMeta: { ...typography.caption, color: colors.textSecondary },
  expertBadgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  emptyRating: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  expertActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  becomeTitle: { ...typography.heading, color: colors.textPrimary },
  becomeBody: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
});
