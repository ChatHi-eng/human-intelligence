import { Redirect } from 'expo-router';

// Creating an account and signing in share one emailed-code flow: Supabase
// creates the account when the email is new. This route stays alive for links
// to /signup and opens that flow worded for a new account.
export default function SignupScreen() {
  return <Redirect href={{ pathname: '/(auth)/login', params: { mode: 'signup' } }} />;
}
