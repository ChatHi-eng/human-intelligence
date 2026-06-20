import { Redirect, Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LoadingView } from '@/components/ui/LoadingView';
import { colors, spacing, typography } from '@/constants/theme';
import { useMyExpertProfile } from '@/hooks/useExperts';

export default function ExpertLayout() {
  const router = useRouter();
  const { data: expertProfile, isLoading } = useMyExpertProfile();

  if (isLoading) return <LoadingView label="Loading expert tools…" />;
  if (!expertProfile) return <Redirect href="/expert-profile-edit" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.background },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
        headerLeft: () => (
          <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>← Customer view</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: spacing.lg },
  backText: { ...typography.bodyStrong, color: colors.accent },
});
