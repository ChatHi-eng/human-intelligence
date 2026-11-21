import { Redirect } from 'expo-router';

// The signed-out front door used to live at /onboarding. It is now /welcome;
// this keeps old links and bookmarks working.
export default function OnboardingRedirect() {
  return <Redirect href="/(auth)/welcome" />;
}
