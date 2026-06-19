import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { LoadingView } from '@/components/ui/LoadingView';
import { exchangeCodeForSession } from '@/services/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();

  useEffect(() => {
    (async () => {
      try {
        if (params.error_description) throw new Error(params.error_description);
        if (!params.code) throw new Error('Missing code in callback URL');
        await exchangeCodeForSession(params.code);
        Toast.show({ type: 'success', text1: 'Signed in' });
        router.replace('/(tabs)');
      } catch (err) {
        Toast.show({
          type: 'error',
          text1: 'Sign-in failed',
          text2: err instanceof Error ? err.message : 'Unknown error',
        });
        router.replace('/(auth)/login');
      }
    })();
  }, [params.code, params.error_description, router]);

  return <LoadingView label="Finishing sign-in…" />;
}
