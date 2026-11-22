import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useCheckPhoneCode, useSendPhoneCode } from '@/hooks/useNotificationPrefs';
import { maskPhone, normalizePhone } from '@/lib/phone';

export type PhoneVerifyProps = {
  /** The number already on file and verified, if any. */
  verifiedPhone?: string | null;
  /** Why the number is being asked for, shown under the title. */
  reason: string;
  onVerified?: () => void;
};

// Proving a mobile number: type it, get a code by text, type the code. Used
// before a first booking and when someone changes their number.
export const PhoneVerify = ({ verifiedPhone, reason, onVerified }: PhoneVerifyProps) => {
  const { mutate: send, isPending: sending } = useSendPhoneCode();
  const { mutate: check, isPending: checking } = useCheckPhoneCode();
  const [changing, setChanging] = useState(false);
  const [typed, setTyped] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (verifiedPhone && !changing) {
    return (
      <View style={styles.card}>
        <View style={styles.doneRow}>
          <Icon name="check-circle" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Mobile number verified</Text>
            <Text style={styles.body}>{maskPhone(verifiedPhone)}</Text>
          </View>
          <Button title="Change" variant="ghost" onPress={() => setChanging(true)} />
        </View>
      </View>
    );
  }

  const onSend = () => {
    const phone = normalizePhone(typed);
    if (!phone) {
      setError('Enter a mobile number. Outside the US and Canada, start with + and your country code.');
      return;
    }
    setError(null);
    send(phone, {
      onSuccess: () => {
        setSentTo(phone);
        setCode('');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Could not send the code.'),
    });
  };

  const onCheck = () => {
    if (!sentTo) return;
    if (code.trim().length < 4) {
      setError('Enter the code from the text.');
      return;
    }
    setError(null);
    check(
      { phone: sentTo, code: code.trim() },
      {
        onSuccess: () => {
          setChanging(false);
          setSentTo(null);
          setTyped('');
          onVerified?.();
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'That code is not right.'),
      },
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {verifiedPhone ? 'Change your mobile number' : 'Verify your mobile number'}
      </Text>
      <Text style={styles.body}>{reason}</Text>

      {sentTo ? (
        <>
          <Text style={styles.label}>Code sent to {maskPhone(sentTo)}</Text>
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setError(null);
            }}
            placeholder="Enter code"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            accessibilityLabel="Code from the text message"
            maxLength={10}
            autoFocus
            style={[styles.input, styles.codeInput]}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Verify number" onPress={onCheck} loading={checking} fullWidth />
          <View style={styles.links}>
            <Button title="Send a new code" variant="ghost" onPress={onSend} loading={sending} />
            <Button
              title="Use a different number"
              variant="ghost"
              onPress={() => {
                setSentTo(null);
                setError(null);
              }}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            value={typed}
            onChangeText={(v) => {
              setTyped(v);
              setError(null);
            }}
            placeholder="(415) 555-0123"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
            accessibilityLabel="Mobile number"
            maxLength={22}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Text me a code" onPress={onSend} loading={sending} fullWidth />
          {verifiedPhone ? (
            <Button title="Keep my current number" variant="ghost" onPress={() => setChanging(false)} />
          ) : null}
          <Text style={styles.fine}>
            We text one code to check the number is yours. Standard message rates apply.
          </Text>
        </>
      )}
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
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typography.bodyStrong, fontSize: 16, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeInput: { fontSize: 20, letterSpacing: 4, textAlign: 'center' },
  error: { ...typography.caption, color: colors.danger },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  fine: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
