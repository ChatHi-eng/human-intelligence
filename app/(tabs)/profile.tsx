import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useMyExpertProfile } from '@/hooks/useExperts';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: expertProfile, isLoading: loadingExpert } = useMyExpertProfile();

  if (!user) return <LoadingView label="Loading…" />;

  return (
    <Screen>
      <SectionHeader title="You" />
      <Card>
        <View style={styles.header}>
          <Avatar uri={user.avatarUrl} name={user.displayName} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.displayName}</Text>
            <Text style={styles.meta}>
              {expertProfile ? 'Expert · Customer' : 'Customer'}
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.actions}>
        {loadingExpert ? (
          <Text style={styles.muted}>Checking expert status…</Text>
        ) : expertProfile ? (
          <>
            <Button
              title="Open expert dashboard"
              onPress={() => router.push('/(expert)/dashboard')}
            />
            <Button
              title="Edit expert profile"
              variant="secondary"
              onPress={() => router.push('/expert-profile-edit')}
            />
          </>
        ) : (
          <Button
            title="Become an expert"
            onPress={() => router.push('/expert-profile-edit')}
            variant="secondary"
          />
        )}
        <Button title="Sign out" onPress={() => void signOut()} variant="ghost" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  name: { ...typography.heading, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  muted: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  actions: { gap: spacing.md, marginTop: spacing.xl },
});
