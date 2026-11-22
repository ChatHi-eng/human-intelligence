import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { usePush } from '@/hooks/usePush';

// How to get Palam onto an iPhone's Home Screen, which is the only place an
// iPhone lets a website send notifications.
export const IPHONE_INSTALL_STEPS =
  'On an iPhone, notifications work once Palam is on your Home Screen. In Safari, tap Share, then Add to Home Screen. Open Palam from there and turn notifications on.';

export const PUSH_BLOCKED_HELP =
  'Notifications are blocked for Palam on this device. Allow them in your browser or phone settings, then come back here.';

// "Not now" hides the card for a week, not forever: the next booking is a
// fair moment to ask again.
const SNOOZE_KEY = 'palam.push.prompt.snoozedUntil';
const SNOOZE_MS = 7 * 24 * 60 * 60_000;
const isSnoozed = () => {
  try {
    return Number(globalThis.localStorage?.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
};
const snooze = () => {
  try {
    globalThis.localStorage?.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* private mode: it will simply show again */
  }
};

export type NotificationPromptProps = {
  title: string;
  body: string;
};

// A card that offers to turn notifications on for this device. It shows only
// when that is still possible and not yet done, at a moment the person has a
// reason to want it: after booking, or in an expert's Studio.
export const NotificationPrompt = ({ title, body }: NotificationPromptProps) => {
  const { state, turnOn } = usePush();
  const [hidden, setHidden] = useState(isSnoozed);

  if (hidden || (state !== 'off' && state !== 'needs-install')) return null;

  const onTurnOn = () =>
    turnOn.mutate(undefined, {
      onSuccess: (result) => {
        if (result.registered) {
          Toast.show({ type: 'success', text1: 'Notifications are on for this device' });
        } else if (result.reason === 'denied') {
          Toast.show({ type: 'info', text1: 'Notifications are blocked', text2: PUSH_BLOCKED_HELP });
        } else {
          Toast.show({
            type: 'error',
            text1: 'Could not turn notifications on',
            text2: 'Try again in a moment. Email reminders still reach you.',
          });
        }
      },
    });

  const onNotNow = () => {
    snooze();
    setHidden(true);
  };

  return (
    <View style={styles.card} accessibilityLabel="Turn on notifications">
      <View style={styles.head}>
        <Icon name="bell" size={18} color={colors.accent} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{state === 'needs-install' ? IPHONE_INSTALL_STEPS : body}</Text>
      <View style={styles.actions}>
        {state === 'off' ? (
          <Button title="Turn on notifications" onPress={onTurnOn} loading={turnOn.isPending} />
        ) : null}
        <Button
          title={state === 'off' ? 'Not now' : 'Got it'}
          variant="ghost"
          onPress={onNotNow}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.bodyStrong, fontSize: 16, color: colors.textPrimary, flex: 1 },
  body: { ...typography.body, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
