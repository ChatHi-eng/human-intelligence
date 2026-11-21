import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import { PayoutsCard } from '@/components/expert/PayoutsCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { PLATFORM_FEE_DISPLAY_PCT, PLATFORM_FEE_PCT } from '@/constants/business';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  useMyExpertProfile,
  useSyncConnectStatus,
  useUpsertMyExpertProfile,
} from '@/hooks/useExperts';
import { currentProfileInput } from '@/lib/expertProfile';
import { formatCurrency } from '@/lib/format';

// The business side of being an expert, kept apart from the public profile:
// what a session costs, where the money goes, and when you can be booked.
export default function SessionSettingsScreen() {
  const router = useRouter();
  const { data: expert, isLoading } = useMyExpertProfile();
  const { mutate: upsert, isPending } = useUpsertMyExpertProfile();
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (expert) setPrice(expert.sessionPrice !== null ? String(expert.sessionPrice / 100) : '');
  }, [expert]);

  // Back from Stripe's payout setup on the web (?stripe=...): the page was
  // reloaded, so ask Stripe where things stand and say so once.
  const { stripe } = useLocalSearchParams<{ stripe?: string }>();
  const { mutate: syncPayouts } = useSyncConnectStatus();
  const hasExpert = Boolean(expert);
  useEffect(() => {
    if (!stripe || !hasExpert) return;
    syncPayouts(undefined, {
      onSuccess: (result) =>
        Toast.show({
          type: result.payoutsEnabled ? 'success' : 'info',
          text1: result.payoutsEnabled ? 'Payouts enabled' : 'Back from Stripe',
          text2: result.payoutsEnabled
            ? 'Ready to accept bookings that pay out to you.'
            : 'Stripe still needs some details. Tap "Finish Stripe setup" to carry on.',
        }),
    });
    router.setParams({ stripe: undefined });
  }, [stripe, hasExpert, syncPayouts, router]);

  if (isLoading) return <LoadingView label="Loading your settings…" />;
  if (!expert) return <Redirect href="/expert-onboarding" />;

  const saved = expert.sessionPrice !== null ? String(expert.sessionPrice / 100) : '';
  const dirty = price.trim() !== saved;
  const amount = Number(price);
  const valid = price.trim() === '' || (Number.isFinite(amount) && amount > 0);
  const cents = price.trim() === '' || !valid ? null : Math.round(amount * 100);

  const onSave = () => {
    if (!valid) {
      setError('Enter a price above zero, or leave it blank to decide later.');
      return;
    }
    setError(null);
    upsert(
      { ...currentProfileInput(expert), sessionPriceCents: cents },
      {
        onSuccess: () => Toast.show({ type: 'success', text1: 'Saved. Live on your profile now.' }),
        onError: (err) =>
          Toast.show({
            type: 'error',
            text1: 'Could not save',
            text2: err instanceof Error ? err.message : 'Unknown error',
          }),
      },
    );
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SectionHeader
          title="Session settings"
          caption="Your price, your payouts and when you can be booked."
        />

        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.title}>Price per 30-minute session (USD)</Text>
          <Text style={styles.body}>
            This is exactly what a customer pays. A change applies to new bookings only.
          </Text>
          <TextInput
            placeholder="75"
            placeholderTextColor={colors.textMuted}
            value={price}
            onChangeText={(v) => {
              setPrice(v);
              setError(null);
            }}
            keyboardType="decimal-pad"
            style={[styles.input, error ? styles.inputError : null]}
            accessibilityLabel="Price per session"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.body}>
            {cents !== null
              ? `You receive ${formatCurrency(Math.floor(cents * (1 - PLATFORM_FEE_PCT)))} per session after Palam's ${PLATFORM_FEE_DISPLAY_PCT}% fee.`
              : 'With no price, your profile shows "Price coming soon" and customers cannot book a paid session.'}
          </Text>
          <Button
            title={dirty ? 'Save price' : 'Saved'}
            onPress={onSave}
            loading={isPending}
            disabled={!dirty}
          />
        </Card>

        <PayoutsCard expert={expert} />

        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.title}>Availability</Text>
          <Text style={styles.body}>
            Weekly hours, days off, free intro calls, the gap between sessions, pausing your
            profile, and whether you approve requests first.
          </Text>
          <Button
            title="Manage availability"
            variant="secondary"
            onPress={() => router.push('/studio/availability')}
          />
        </Card>

        <Button
          title="Done"
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/studio'))}
          fullWidth
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.caption, color: colors.textSecondary },
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
  inputError: { borderColor: colors.danger, borderWidth: 1 },
  error: { ...typography.caption, color: colors.danger },
});
