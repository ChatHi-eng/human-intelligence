import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ExpertList } from '@/components/expert/ExpertList';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { industries } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useExperts } from '@/hooks/useExperts';

export default function DiscoverScreen() {
  const router = useRouter();
  const [industryId, setIndustryId] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const { data: experts, isLoading } = useExperts({ industryId, query });

  const noFiltersActive = !industryId && !query;
  const dbIsEmpty = !isLoading && experts && experts.length === 0 && noFiltersActive;

  return (
    <Screen>
      {dbIsEmpty ? (
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.lg }}>
          <SectionHeader
            title="Talk to a human"
            caption="Verified experts. Real video or phone advice — on your schedule."
          />
          <EmptyState
            title="No experts yet"
            description="Be the first — open your profile tab and tap Become an expert."
            emoji="🧠"
          />
        </View>
      ) : (
        <ExpertList
          experts={experts}
          isLoading={isLoading}
          onPressExpert={(e) => router.push(`/expert/${e.id}`)}
          ListHeaderComponent={
            <View style={styles.header}>
              <SectionHeader
                title="Talk to a human"
                caption="Verified experts. Real video or phone advice — on your schedule."
              />
              <TextInput
                placeholder="Search by expertise, name…"
                placeholderTextColor={colors.textMuted}
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                <FilterChip
                  label="All"
                  active={industryId === undefined}
                  onPress={() => setIndustryId(undefined)}
                />
                {industries.map((i) => (
                  <FilterChip
                    key={i.id}
                    label={`${i.emoji}  ${i.label}`}
                    active={industryId === i.id}
                    onPress={() => setIndustryId(i.id)}
                  />
                ))}
              </ScrollView>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const FilterChip = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={[chipStyles.chip, active && chipStyles.chipActive]}>
    <Text style={[chipStyles.text, active && chipStyles.textActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  header: { paddingTop: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
});

const chipStyles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.textPrimary },
  text: { ...typography.bodyStrong, color: colors.textPrimary },
  textActive: { color: '#FFFFFF' },
});
