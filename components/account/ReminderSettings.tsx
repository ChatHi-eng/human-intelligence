import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SMS_REMINDERS_ENABLED } from '@/constants/featureFlags';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useNotificationPrefs, useSaveNotificationPrefs } from '@/hooks/useNotificationPrefs';
import { usePush } from '@/hooks/usePush';
import { IPHONE_INSTALL_STEPS, PUSH_BLOCKED_HELP } from './NotificationPrompt';

// E.164: a plus sign, country code, then the number. No spaces or dashes.
const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;

// What the notifications row says under its title, by state.
const pushCaption = {
  on: 'On for this device. You hear about bookings here, and get a reminder a day, an hour and ten minutes before each session.',
  off: 'Bookings and session reminders, sent to this device.',
  blocked: PUSH_BLOCKED_HELP,
  'needs-install': IPHONE_INSTALL_STEPS,
  unsupported: 'This browser cannot show notifications. Email reminders still reach you.',
} as const;

// How a person wants to be reminded about sessions: notification, email,
// text. Shown on the account screen for customers and experts alike.
export const ReminderSettings = () => {
  const { data: prefs } = useNotificationPrefs();
  const { mutate: save, isPending: saving } = useSaveNotificationPrefs();
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [phone, setPhone] = useState('');
  const { state: pushState, turnOn, turnOff, test } = usePush();

  useEffect(() => {
    if (prefs) {
      setEmail(prefs.emailReminders);
      setSms(prefs.smsReminders);
      setPhone(prefs.phone ?? '');
    }
  }, [prefs]);

  const onSave = () => {
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (sms && !PHONE_PATTERN.test(cleaned)) {
      Toast.show({
        type: 'error',
        text1: 'Check the phone number',
        text2: 'Include the country code, for example +14155550123.',
      });
      return;
    }
    save(
      { emailReminders: email, smsReminders: sms, phone: cleaned || null },
      {
        onSuccess: () => Toast.show({ type: 'success', text1: 'Reminder settings saved' }),
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not save',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  const onTurnOnPush = () =>
    turnOn.mutate(undefined, {
      onSuccess: (result) =>
        Toast.show(
          result.registered
            ? { type: 'success', text1: 'Notifications are on for this device' }
            : result.reason === 'denied'
              ? { type: 'info', text1: 'Notifications are blocked', text2: PUSH_BLOCKED_HELP }
              : {
                  type: 'error',
                  text1: 'Could not turn notifications on',
                  text2: 'Try again in a moment. Email reminders still reach you.',
                },
        ),
    });

  const onTestPush = () =>
    test.mutate(undefined, {
      onSuccess: (delivered) =>
        Toast.show(
          delivered > 0
            ? { type: 'success', text1: 'Test sent', text2: 'It should appear in a few seconds.' }
            : {
                type: 'info',
                text1: 'Nothing to send to',
                text2: 'Turn notifications off and on again for this device.',
              },
        ),
      onError: () => Toast.show({ type: 'error', text1: 'Could not send the test' }),
    });

  return (
    <Card style={{ gap: spacing.md }}>
      <Text style={styles.title}>Session reminders</Text>
      <Text style={styles.caption}>
        We remind you a day before, an hour before and ten minutes before every confirmed
        session.
      </Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Notifications</Text>
          <Text style={styles.caption}>{pushCaption[pushState ?? 'off']}</Text>
        </View>
        {pushState === 'off' ? (
          <Button
            title="Turn on"
            variant="secondary"
            onPress={onTurnOnPush}
            loading={turnOn.isPending}
          />
        ) : null}
      </View>
      {pushState === 'on' ? (
        <View style={styles.pushActions}>
          <Button
            title="Send a test"
            variant="secondary"
            onPress={onTestPush}
            loading={test.isPending}
          />
          <Button
            title="Turn off"
            variant="ghost"
            onPress={() => turnOff.mutate()}
            loading={turnOff.isPending}
          />
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Email</Text>
          <Text style={styles.caption}>
            To the address you sign in with. Booking confirmations always come by email.
          </Text>
        </View>
        <Switch value={email} onValueChange={setEmail} accessibilityLabel="Email reminders" />
      </View>

      {SMS_REMINDERS_ENABLED ? (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Text message</Text>
            <Text style={styles.caption}>Sent to the number below.</Text>
          </View>
          <Switch value={sms} onValueChange={setSms} accessibilityLabel="Text message reminders" />
        </View>
      ) : null}
      {SMS_REMINDERS_ENABLED && sms ? (
        <>
          <TextInput
            placeholder="+14155550123"
            placeholderTextColor={colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={styles.input}
            maxLength={20}
          />
          <Text style={styles.caption}>
            By turning this on you agree to receive session reminder texts from Palam at this
            number. Message and data rates may apply. Reply STOP to any text to opt out. Only
            you can see this number.
          </Text>
        </>
      ) : null}

      <Button title="Save reminder settings" variant="secondary" onPress={onSave} loading={saving} />
    </Card>
  );
};

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  pushActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
