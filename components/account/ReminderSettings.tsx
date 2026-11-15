import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SMS_REMINDERS_ENABLED } from '@/constants/featureFlags';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useNotificationPrefs, useSaveNotificationPrefs } from '@/hooks/useNotificationPrefs';
import { pushSupported, registerForPush } from '@/services/push';

// E.164: a plus sign, country code, then the number. No spaces or dashes.
const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;

const pushReason = {
  web: 'Phone notifications work in the Palam app on your phone, not in a browser.',
  simulator: 'Phone notifications need a real phone.',
  denied: 'Notifications are switched off for Palam in your phone settings.',
  unavailable: 'Notifications are not available in this build yet.',
} as const;

// How a person wants to be reminded about sessions: email, text, phone
// notification. Shown on the account screen for customers and experts alike.
export const ReminderSettings = ({ userId }: { userId: string }) => {
  const { data: prefs } = useNotificationPrefs();
  const { mutate: save, isPending: saving } = useSaveNotificationPrefs();
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [phone, setPhone] = useState('');
  const [enablingPush, setEnablingPush] = useState(false);

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

  const onEnablePush = async () => {
    setEnablingPush(true);
    const result = await registerForPush(userId);
    setEnablingPush(false);
    Toast.show(
      result.registered
        ? { type: 'success', text1: 'Notifications are on for this phone' }
        : { type: 'info', text1: 'Not turned on', text2: pushReason[result.reason] },
    );
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <Text style={styles.title}>Session reminders</Text>
      <Text style={styles.caption}>
        We remind you a day before and an hour before every confirmed session.
      </Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Email</Text>
          <Text style={styles.caption}>To the address you sign in with.</Text>
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

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Phone notifications</Text>
          <Text style={styles.caption}>
            {pushSupported
              ? 'Turn them on for this phone.'
              : 'Available in the Palam app on your phone.'}
          </Text>
        </View>
        {pushSupported ? (
          <Button
            title="Turn on"
            variant="secondary"
            onPress={() => void onEnablePush()}
            loading={enablingPush}
          />
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.textPrimary },
  caption: { ...typography.caption, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
