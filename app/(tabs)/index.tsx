import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ExpertList } from '@/components/expert/ExpertList';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { industries } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useExperts } from '@/hooks/useExperts';

type Filters = {
  industryId?: string;
  query: string;
  minRating?: number;
  maxHourlyRateCents?: number;
};

type FilterOption = { label: string; value?: number };

const RATING_OPTIONS: FilterOption[] = [
  { label: 'Any rating', value: undefined },
  { label: '4.0+', value: 4 },
  { label: '4.5+', value: 4.5 },
  { label: '4.8+', value: 4.8 },
];

const PRICE_OPTIONS: FilterOption[] = [
  { label: 'Any price', value: undefined },
  { label: 'Under $75/hr', value: 7500 },
  { label: 'Under $150/hr', value: 15000 },
  { label: 'Under $250/hr', value: 25000 },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({ query: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: experts, isLoading } = useExperts({
    industryId: filters.industryId,
    query: filters.query || undefined,
    minRating: filters.minRating,
    maxHourlyRateCents: filters.maxHourlyRateCents,
  });

  const noFiltersActive =
    !filters.industryId &&
    !filters.query &&
    filters.minRating === undefined &&
    filters.maxHourlyRateCents === undefined;
  const dbIsEmpty = !isLoading && experts && experts.length === 0 && noFiltersActive;
  const activeFilterCount =
    (filters.minRating !== undefined ? 1 : 0) +
    (filters.maxHourlyRateCents !== undefined ? 1 : 0);

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
              <View style={styles.searchRow}>
                <TextInput
                  placeholder="Search by expertise, name…"
                  placeholderTextColor={colors.textMuted}
                  style={styles.search}
                  value={filters.query}
                  onChangeText={(query) => setFilters({ ...filters, query })}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                <Pressable
                  onPress={() => setFiltersOpen(true)}
                  style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      activeFilterCount > 0 && styles.filterTextActive,
                    ]}
                  >
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  </Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                <FilterChip
                  label="All"
                  active={filters.industryId === undefined}
                  onPress={() => setFilters({ ...filters, industryId: undefined })}
                />
                {industries.map((i) => (
                  <FilterChip
                    key={i.id}
                    label={`${i.emoji}  ${i.label}`}
                    active={filters.industryId === i.id}
                    onPress={() => setFilters({ ...filters, industryId: i.id })}
                  />
                ))}
              </ScrollView>
            </View>
          }
        />
      )}

      <FilterSheet
        visible={filtersOpen}
        filters={filters}
        onClose={() => setFiltersOpen(false)}
        onChange={(next) => setFilters({ ...filters, ...next })}
        onReset={() =>
          setFilters({ ...filters, minRating: undefined, maxHourlyRateCents: undefined })
        }
      />
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

const FilterSheet = ({
  visible,
  filters,
  onClose,
  onChange,
  onReset,
}: {
  visible: boolean;
  filters: Filters;
  onClose: () => void;
  onChange: (next: Partial<Filters>) => void;
  onReset: () => void;
}) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <Pressable style={styles.sheetBackdrop} onPress={onClose} />
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>Filters</Text>

      <Text style={styles.sheetLabel}>Minimum rating</Text>
      <View style={styles.sheetOptions}>
        {RATING_OPTIONS.map((o) => {
          const active = filters.minRating === o.value;
          return (
            <Pressable
              key={o.label}
              onPress={() => onChange({ minRating: o.value })}
              style={[chipStyles.chip, active && chipStyles.chipActive]}
            >
              <Text style={[chipStyles.text, active && chipStyles.textActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sheetLabel}>Hourly rate</Text>
      <View style={styles.sheetOptions}>
        {PRICE_OPTIONS.map((o) => {
          const active = filters.maxHourlyRateCents === o.value;
          return (
            <Pressable
              key={o.label}
              onPress={() => onChange({ maxHourlyRateCents: o.value })}
              style={[chipStyles.chip, active && chipStyles.chipActive]}
            >
              <Text style={[chipStyles.text, active && chipStyles.textActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sheetActions}>
        <Button title="Reset" variant="ghost" onPress={onReset} style={{ flex: 1 }} />
        <Button title="Done" onPress={onClose} style={{ flex: 1 }} />
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  header: { paddingTop: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  search: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterButton: {
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterButtonActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  filterText: { ...typography.bodyStrong, color: colors.textPrimary },
  filterTextActive: { color: '#FFFFFF' },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sheetTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
  sheetLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  sheetOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
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
