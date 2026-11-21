import { Stack } from 'expo-router';
import { colors, fonts } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.textPrimary, fontFamily: fonts.semiBold, fontSize: 16 },
      }}
    >
      <Stack.Screen name="login" options={{ title: '' }} />
      <Stack.Screen name="signup" options={{ title: 'Create account' }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Welcome' }} />
    </Stack>
  );
}
