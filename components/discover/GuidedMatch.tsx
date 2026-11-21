import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { industryById } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { matchExperts, nextOpening, openingLabel, topicsForField } from '@/lib/discover';
import { capture } from '@/services/analytics';
import type { Expert } from '@/types/user';

export type GuidedMatchProps = {
  experts: Expert[];
  onPressExpert: (expert: Expert) => void;
};

// "What do you need help with?" in two taps: a field, then a topic in it.
// Returns up to three people with one checkable reason each. Fields and
// topics come only from experts who exist, so no choice leads to nobody.
export const GuidedMatch = ({ experts, onPressExpert }: GuidedMatchProps) => {
  const [fieldId, setFieldId] = useState<string | null>(null);
  // undefined = not chosen yet; null = "not sure yet" (any topic).
  const [topic, setTopic] = useState<string | null | undefined>(undefined);

  const fields = useMemo(() => {
    const ids = [...new Set(experts.map((e) => e.industryId))];
    return ids
      .map((id) => industryById(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));
  }, [experts]);
  const topics = useMemo(
    () => (fieldId ? topicsForField(experts, fieldId) : []),
    [experts, fieldId],
  );
  // A field with no listed topics has nothing to ask in step two.
  const answered = fieldId !== null && (topic !== undefined || topics.length === 0);
  const matches = useMemo(
    () => (fieldId && answered ? matchExperts(experts, fieldId, topic ?? null) : []),
    [experts, fieldId, topic, answered],
  );

  if (fields.length === 0) return null;

  const pickField = (id: string) => {
    setFieldId(id);
    setTopic(undefined);
    capture('guided_match_field', { field: id });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>What do you need help with?</Text>

      {!fieldId ? (
        <View style={styles.chips}>
          {fields.map((f) => (
            <Chip key={f.id} label={f.label} onPress={() => pickField(f.id)} />
          ))}
        </View>
      ) : !answered ? (
        <>
          <Text style={styles.step}>Which part of it?</Text>
          <View style={styles.chips}>
            {topics.map((t) => (
              <Chip
                key={t}
                label={t}
                onPress={() => {
                  setTopic(t);
                  capture('guided_match_topic', { chose_topic: true });
                }}
              />
            ))}
            <Chip
              label="Not sure yet"
              onPress={() => {
                setTopic(null);
                capture('guided_match_topic', { chose_topic: false });
              }}
            />
          </View>
        </>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.step}>
            {matches.length === 1 ? 'One person to talk to' : `${matches.length} people to talk to`}
          </Text>
          {matches.map(({ expert, reason }) => {
            const opening = nextOpening(expert);
            return (
              <Pressable key={expert.id} onPress={() => onPressExpert(expert)} style={styles.match}>
                <Avatar uri={expert.avatarUrl} name={expert.displayName} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchName}>{expert.displayName}</Text>
                  <Text style={styles.matchReason}>{reason}</Text>
                  <Text style={styles.matchOpening}>
                    {opening ? openingLabel(opening) : 'No open times right now'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {fieldId ? (
        <Pressable
          onPress={() => {
            setFieldId(null);
            setTopic(undefined);
          }}
          hitSlop={8}
        >
          <Text style={styles.link}>Start over</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const Chip = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.chip}>
    <Text style={styles.chipText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  step: { ...typography.body, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipText: { ...typography.body, color: colors.textPrimary },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  matchName: { ...typography.bodyStrong, color: colors.textPrimary },
  matchReason: { ...typography.caption, color: colors.textSecondary },
  matchOpening: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
  link: { ...typography.bodyStrong, color: colors.textPrimary, textDecorationLine: 'underline' },
});
