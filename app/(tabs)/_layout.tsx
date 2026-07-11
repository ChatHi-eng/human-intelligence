import { Tabs } from 'expo-router';
import { colors } from '@/constants/theme';
import { usePendingRequests } from '@/hooks/useBookings';
import { useMyExpertProfile } from '@/hooks/useExperts';

export default function TabsLayout() {
  const { data: expertProfile } = useMyExpertProfile();
  const { data: pending = [] } = usePendingRequests();
  const isExpert = Boolean(expertProfile);
  const pendingCount = pending.length;

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
      <Tabs.Screen name="index" options={{ title: 'Discover' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'Studio',
          // Hide the tab entirely when the user isn't an expert. Setting href to
          // null keeps the route file valid but drops it from the tab bar.
          href: isExpert ? '/studio' : null,
          tabBarBadge: isExpert && pendingCount > 0 ? String(pendingCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: '#FFFFFF' },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
