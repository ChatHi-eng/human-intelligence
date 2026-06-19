import { Redirect } from 'expo-router';

// Signup and signin go through the same magic-link flow — Supabase creates the
// account automatically if the email is new. Keep the route alive for deep
// links and clarity, but redirect to /login.
export default function SignupScreen() {
  return <Redirect href="/(auth)/login" />;
}
