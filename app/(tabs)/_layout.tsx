import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MESSAGING_ENABLED } from '@/constants/featureFlags';
import { colors, fonts } from '@/constants/theme';
import { usePendingRequests } from '@/hooks/useBookings';
import { useMyExpertProfile } from '@/hooks/useExperts';

type FeatherName = keyof typeof Feather.glyphMap;
type TabIconProps = { color: string; size: number };

const TabIcon = ({ name, color, size }: TabIconProps & { name: FeatherName }) => (
  <Feather name={name} size={Math.min(size, 22)} color={color} />
);

export default function TabsLayout() {
  const { data: expertProfile } = useMyExpertProfile();
  const { data: pending = [] } = usePendingRequests();
  const isExpert = Boolean(expertProfile);
  const pendingCount = pending.length;
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        // Each tab opens with its own big title, so the bar above it would
        // only say the same word twice.
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // Tall enough for the icon and its label; the label was being cut off.
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          height: 60 + insets.bottom,
          paddingTop: 8,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11, marginTop: 2 },
        sceneStyle: { backgroundColor: colors.background, paddingTop: insets.top },
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
