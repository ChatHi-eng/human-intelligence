import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, role, switchToCustomer, switchToExpert, signOut } = useAuth();

  return (
    <Screen>
      <SectionHeader title="You" />
      <Card>
        <View style={styles.header}>
          <Avatar uri={user?.avatarUrl} name={user?.displayName ?? '?'} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.displayName ?? 'Not signed in'}</Text>
            <Text style={styles.meta}>Role: {role ?? '—'}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.actions}>
        {role === 'expert' ? (
          <Button title="Open expert dashboard" onPress={() => router.push('/(expert)/dashboard')} />
        ) : (
          <Button title="Switch to expert mode" onPress={switchToExpert} variant="secondary" />
        )}
        {role !== 'customer' && (
          <Button title="Switch to customer mode" onPress={switchToCustomer} variant="ghost" />
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
  actions: { gap: spacing.md, marginTop: spacing.xl },
});
