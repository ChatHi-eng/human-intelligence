import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { colors, fonts, spacing, typography } from '@/constants/theme';
import { formatDay, formatTime } from '@/lib/date';
import { rememberReturnPath } from '@/lib/returnPath';
import { capture } from '@/services/analytics';
import { joinCall, openCallRoom, type JoinResult } from '@/services/video';
import { useAuthStore } from '@/store/authStore';

// The way into a call.
//
//   /join?b=<booking>&k=<personal key>   the "Join the call" link in an
//       email, text or notification. The key says who you are, so this works
//       whether or not you are signed in on this device.
//   /join?b=<booking>                    what the Join button in the app
//       opens. No key: you have to be signed in and on the booking.
//
// Either way Palam hands over that person's own pass into the room and sends
// them in. The room lets nobody in without one. If it is too early, this
// page says when and goes in by itself once the time comes.
export default function JoinScreen() {
  const router = useRouter();
  const { b, k } = useLocalSearchParams<{ b?: string; k?: string }>();
  const signedIn = useAuthStore((s) => Boolean(s.user));
  const hydrated = useAuthStore((s) => s.isHydrated);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const entered = useRef(false);

  const enter = useCallback(
    async (url: string) => {
      if (entered.current) return;
      entered.current = true;
      capture('call_joined', { via: k ? 'link' : 'booking' });
      if (Platform.OS === 'web') {
        // The same tab becomes the call. A new tab would be blocked here,
        // because nothing was tapped on this page.
        window.location.replace(url);
        return;
      }
      await openCallRoom(url);
      if (b) router.replace({ pathname: '/booking/[id]', params: { id: b } });
    },
    [b, k, router],
  );

  const tryJoin = useCallback(async () => {
    if (!b) {
      setResult({ status: 'invalid' });
      return;
    }
    // No key: wait to find out whether this person is signed in. If they are
    // not, the screen below asks them to.
    if (!k && (!hydrated || !signedIn)) return;
    setFailed(false);
    setOpening(true);
    try {
      const next = await joinCall(b, k || undefined);
      setResult(next);
      if (next.status === 'ok') await enter(next.url);
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }, [b, k, enter, hydrated, signedIn]);

  useEffect(() => {
    void tryJoin();
  }, [tryJoin]);

  // Opened early and left open: go in when the doors open.
  const joinFromAt = result?.status === 'early' ? result.joinFromAt : null;
  useEffect(() => {
    if (!joinFromAt) return;
    const wait = new Date(joinFromAt).getTime() - Date.now() + 1500;
    // Timers cannot be set further out than about 24 days.
    if (wait > 2_000_000_000) return;
    const timer = setTimeout(() => void tryJoin(), Math.max(wait, 1500));
    return () => clearTimeout(timer);
  }, [joinFromAt, tryJoin]);

  if (b && !k && hydrated && !signedIn) {
    return (
      <Shell
        title="Sign in to join your call"
        body="Sign in with the email you booked with, then tap Join on the booking. Or use the Join link in your reminder email, which works without signing in."
        primary={{
          title: 'Sign in',
          onPress: () => {
            rememberReturnPath(`/booking/${b}`);
            router.replace('/(auth)/welcome');
          },
        }}
      />
    );
  }
  if (failed) {
    return (
      <Shell
        title="We couldn't open the call"
        body="Check your connection and try again."
        primary={{ title: 'Try again', onPress: () => void tryJoin(), loading: opening }}
      />
    );
  }
  if (!result || result.status === 'ok') {
    return <LoadingView label={result ? 'Opening your call…' : 'Finding your session…'} />;
  }

  const who = 'otherName' in result && result.otherName ? result.otherName : null;
  const what = 'kind' in result && result.kind === 'intro' ? 'intro call' : 'session';
  const withWho = who ? ` with ${who}` : '';
  const toBooking =
    'bookingId' in result && result.bookingId
      ? {
          title: signedIn ? 'Open my booking' : 'Sign in to see my booking',
          onPress: () =>
            router.replace({ pathname: '/booking/[id]', params: { id: result.bookingId } }),
        }
      : undefined;
  const toHome = { title: 'Open Palam', onPress: () => router.replace('/') };

  if (result.status === 'early') {
    return (
      <Shell
        title={`Your ${what}${withWho} starts ${formatDay(result.startAt)} at ${formatTime(result.startAt)}`}
        body={`You can join from ${formatTime(result.joinFromAt)}. Leave this page open and it will take you in, or come back to this link then.`}
        primary={toBooking ?? toHome}
      />
    );
  }
  if (result.status === 'ended') {
    return (
      <Shell
        title="This call has ended"
        body={`Your ${what}${withWho} finished at ${formatTime(result.endAt)}.`}
        primary={toBooking ?? toHome}
      />
    );
  }
  if (result.status === 'cancelled') {
    return (
      <Shell
        title={`This ${what} was cancelled`}
        body="There is no call to join. The booking has the details."
        primary={toBooking ?? toHome}
      />
    );
  }
  if (result.status === 'not_confirmed') {
    return (
      <Shell
        title="This request has not been accepted yet"
        body="The call opens once the session is confirmed."
        primary={toBooking ?? toHome}
      />
    );
  }
  return (
    <Shell
      title="This link does not work"
      body="It may have been cut short when it was copied. Open the booking in Palam and tap Join instead."
      primary={toHome}
    />
  );
}

type ShellProps = {
  title: string;
  body: string;
  primary: { title: string; onPress: () => void; loading?: boolean };
};

const Shell = ({ title, body, primary }: ShellProps) => (
  <Screen>
    <View style={styles.container}>
      <Text style={styles.wordmark}>palam</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Button title={primary.title} onPress={primary.onPress} loading={primary.loading} />
    </View>
  </Screen>
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  wordmark: {
    fontFamily: fonts.bold,
    fontSize: 28,
    letterSpacing: -0.8,
    color: colors.accent,
    marginBottom: spacing.lg,
  },
  title: { ...typography.title, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
});
