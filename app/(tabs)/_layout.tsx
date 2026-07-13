import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { MESSAGING_ENABLED } from '@/constants/featureFlags';
import { colors, fonts } from '@/constants/theme';
import { usePendingRequests } from '@/hooks/useBookings';
import { useMyExpertProfile } from '@/hooks/useExperts';

type FeatherName = keyof typeof Feather.glyphMap;
type TabIconProps = { color: string; size: number };

const TabIcon = ({ name, color, size }: TabIconProps & { name: FeatherName }) => (
  <Feather name={name} size={size - 2} color={color} />
);

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
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: fonts.semiBold, fontSize: 11 },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 18 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Discover', tabBarIcon: (p: TabIconProps) => <TabIcon name="search" {...p} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'Bookings', tabBarIcon: (p: TabIconProps) => <TabIcon name="calendar" {...p} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          href: MESSAGING_ENABLED ? '/messages' : null,
          tabBarIcon: (p: TabIconProps) => <TabIcon name="message-circle" {...p} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'Studio',
          href: isExpert ? '/studio' : null,
          tabBarIcon: (p: TabIconProps) => <TabIcon name="briefcase" {...p} />,
          tabBarBadge: isExpert && pendingCount > 0 ? String(pendingCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: '#FFFFFF',
            fontFamily: fonts.semiBold,
            fontSize: 11,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'You', tabBarIcon: (p: TabIconProps) => <TabIcon name="user" {...p} /> }}
      />
    </Tabs>
  );
}
