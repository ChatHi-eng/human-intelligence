import { StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing, typography } from '@/constants/theme';
import { useStartConnectOnboarding, useSyncConnectStatus } from '@/hooks/useExperts';
import { useAppConfig } from '@/hooks/useNotificationPrefs';
import { DEFAULT_APP_CONFIG } from '@/services/api';

export type PayoutsCardProps = {
  expert: { stripeConnectAccountId: string | null; stripeConnectPayoutsEnabled: boolean };
};

// Where an expert connects the bank account Palam pays them into (Stripe
// Connect). Lives on the Session settings screen.
export const PayoutsCard = ({ expert }: PayoutsCardProps) => {
  const { data: config = DEFAULT_APP_CONFIG } = useAppConfig();
  const { mutate: start, isPending } = useStartConnectOnboarding();
  const { mutate: sync, isPending: syncing } = useSyncConnectStatus();
  const isReady = expert.stripeConnectPayoutsEnabled;
  const isStarted = Boolean(expert.stripeConnectAccountId) && !isReady;

  const status = isReady
    ? { label: 'Ready', tone: 'success' as const }
    : isStarted
      ? { label: 'In progress', tone: 'warning' as const }
      : { label: 'Not set up', tone: 'neutral' as const };

  const onPress = () =>
    start(undefined, {
      onSuccess: (result) => {
        const nowReady = result.status?.payoutsEnabled;
        Toast.show({
          type: 'success',
          text1: nowReady ? 'Payouts enabled' : 'Returned from Stripe',
          text2: nowReady
            ? 'Ready to accept bookings that pay out to you.'
            : result.status?.status === 'action-required'
              ? 'Stripe still needs some info. Tap "Finish Stripe setup" again.'
              : 'We will pick up your status from Stripe.',
        });
      },
      onError: (err) =>
        Toast.show({
          type: 'error',
          text1: 'Could not open Stripe',
          text2: err instanceof Error ? err.message : 'Unknown error',
        }),
    });

  const onRefresh = () =>
    sync(undefined, {
      onSuccess: (result) => {
        Toast.show({
          type: result.payoutsEnabled ? 'success' : 'info',
          text1: result.payoutsEnabled ? 'Payouts enabled' : 'Not ready yet',
          text2:
            result.missingRequirements && result.missingRequirements.length > 0
              ? `Stripe needs: ${result.missingRequirements.slice(0, 2).join(', ')}${
                  result.missingRequirements.length > 2 ? '…' : ''
                }`
              : `Status: ${result.status}`,
        });
      },
      onError: (err) =>
        Toast.show({
          type: 'error',
          text1: 'Could not check status',
          text2: err instanceof Error ? err.message : 'Unknown error',
        }),
    });

  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Payouts</Text>
          <Text style={styles.body}>
            Customers pay through Stripe, and Stripe pays you {config.payoutHoldHours} hours
            after each session. Until you finish this setup, payments are held for you by
            Palam.
            {__DEV__ ? ' Test mode uses fake bank details: enter anything plausible.' : ''}
          </Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Button
        title={
          isReady ? 'Update payout info' : isStarted ? 'Finish Stripe setup' : 'Set up payouts'
        }
        variant="secondary"
        onPress={onPress}
        loading={isPending}
        style={{ marginTop: spacing.md }}
      />
      {isStarted && (
        <Button
          title={syncing ? 'Checking Stripe…' : 'Refresh status'}
          variant="ghost"
          onPress={onRefresh}
          loading={syncing}
          style={{ marginTop: spacing.xs }}
        />
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
});
