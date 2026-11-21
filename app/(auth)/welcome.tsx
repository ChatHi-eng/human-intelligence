import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Portrait } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { PHONE_SESSIONS_ENABLED } from '@/constants/featureFlags';
import { colors, fonts, radius, shadow, spacing, typography } from '@/constants/theme';
import { useExperts } from '@/hooks/useExperts';

// The front door for anyone who is not signed in. Customers and experts
// launch together (decided 2026-11-21), so this speaks to both: what a
// customer gets first, then the invitation to people who could be experts.
// One account serves both; the expert application starts from a card on the
// home screen, so nothing here is labelled as the application itself.
//
// The picture at the top is the product itself: the people you can book right
// now, read from the same public list Discover uses. With nobody listed yet
// it is left out and the words stand alone.
export default function WelcomeScreen() {
  const router = useRouter();
  const { data: experts } = useExperts({});
  const faces = (experts ?? []).slice(0, 3);

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.wordmark}>palam</Text>

        {faces.length > 0 ? (
          <View style={styles.faces}>
            {faces.map((e, i) => (
              <View
                key={e.id}
                style={[
                  styles.face,
                  faces.length > 1 && i === 1 && styles.faceRaised,
                  faces.length === 1 && styles.faceSolo,
                ]}
              >
                <Portrait uri={e.avatarUrl} name={e.displayName} height={faces.length === 1 ? 200 : 140} />
                <Text style={styles.faceName} numberOfLines={1}>
                  {e.displayName}
                </Text>
                <Text style={styles.faceRole} numberOfLines={1}>
                  {e.currentTitle || e.headline}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.words}>
          <Text style={styles.title}>Talk to a human who knows.</Text>
          <Text style={styles.body}>
            {PHONE_SESSIONS_ENABLED
              ? 'Every search answers with AI now. Palam is a direct line to people who have lived it, across business, entertainment, healthcare, law, design, fashion, contracting, home repair and more. Book a 30-minute video or phone call with one when you need it.'
              : 'Every search answers with AI now. Palam is a direct line to people who have lived it, across business, entertainment, healthcare, law, design, fashion, contracting, home repair and more. Book a 30-minute video call with one when you need it.'}
          </Text>
          <View style={styles.expertLine}>
            <Icon name="award" size={18} color={colors.accentInk} />
            <Text style={styles.expertText}>
              If you&apos;re the one people come to for advice, apply as an expert and get paid for
              it.
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title="Create account"
            onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'signup' } })}
            fullWidth
          />
          <Button
            title="Sign in"
            variant="secondary"
            onPress={() => router.push({ pathname: '/(auth)/login', params: { mode: 'signin' } })}
            fullWidth
          />
          <Text style={styles.note}>
            With one account you can book a session or apply as an expert.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Wordmark at the top, the actions within thumb reach at the bottom, and
  // the pitch between them. Capped so it does not stretch on a wide window.
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  wordmark: {
    fontFamily: fonts.bold,
    fontSize: 28,
    letterSpacing: -0.8,
    color: colors.accent,
  },
  faces: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  face: {
    flex: 1,
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.lg + spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.floating,
  },
  faceRaised: { marginTop: spacing.xl },
  faceSolo: { maxWidth: 220 },
  faceName: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: spacing.sm },
  faceRole: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  words: { gap: spacing.md, flex: 1, justifyContent: 'center' },
  title: { ...typography.display, fontSize: 34, lineHeight: 40, color: colors.textPrimary },
  body: { ...typography.body, fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  expertLine: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  expertText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  actions: { alignSelf: 'stretch', gap: spacing.sm },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
