import { Redirect, Tabs } from 'expo-router';
import { LoadingView } from '@/components/ui/LoadingView';
import { colors } from '@/constants/theme';
import { useMyExpertProfile } from '@/hooks/useExperts';

export default function ExpertLayout() {
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
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings' }} />
    </Tabs>
  );
}
