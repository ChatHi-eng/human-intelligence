import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ExpertRow } from '@/components/discover/ExpertRow';
import { GuidedMatch } from '@/components/discover/GuidedMatch';
import { RequestExpert } from '@/components/discover/RequestExpert';
import { ExpertList } from '@/components/expert/ExpertList';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';

import {
  AVAILABLE_ROW_MIN_EXPERTS,
  FIELD_ROWS_MIN_EXPERTS,
  GUIDED_MATCH_MIN_EXPERTS,
  MIN_REVIEWS_FOR_RATING,
} from '@/constants/business';
import { PHONE_SESSIONS_ENABLED } from '@/constants/featureFlags';
import { industries } from '@/constants/industries';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useExperts, useMyExpertProfile } from '@/hooks/useExperts';
import { availableWithin, sortExperts, type ExpertSort } from '@/lib/discover';
import { filterExpertsByQuery } from '@/services/api';

const DISCOVER_CAPTION = PHONE_SESSIONS_ENABLED
  ? 'Vetted people who have lived what you need help with, by video or phone.'
  : 'Vetted people who have lived what you need help with.';

type Filters = {
  industryId?: string;
  query: string;
  minRating?: number;
  maxSessionPriceCents?: number;
  sort: ExpertSort;
};

const SORT_OPTIONS: { label: string; value: ExpertSort }[] = [
  { label: 'Recommended', value: 'recommended' },
  { label: 'Soonest available', value: 'soonest' },
  { label: 'Top rated', value: 'rating' },
  { label: 'Price, low to high', value: 'price' },
];

type FilterOption = { label: string; value?: number };

const RATING_OPTIONS: FilterOption[] = [
  { label: 'Any rating', value: undefined },
  { label: '4.0+', value: 4 },
  { label: '4.5+', value: 4.5 },
  { label: '4.8+', value: 4.8 },
];

const PRICE_OPTIONS: FilterOption[] = [
  { label: 'Any price', value: undefined },
  { label: 'Under $50', value: 5000 },
  { label: 'Under $100', value: 10000 },
  { label: 'Under $150', value: 15000 },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({ query: '', sort: 'recommended' });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The text search runs on the list already in memory. Putting the query in
  // the request reloaded the list on every keystroke and dropped the keyboard.
  const { data: fetched, isLoading } = useExperts({
    industryId: filters.industryId,
    minRating: filters.minRating,
    maxSessionPriceCents: filters.maxSessionPriceCents,
  });
  const experts = useMemo(
    () =>
      fetched
        ? sortExperts(filterExpertsByQuery(fetched, filters.query), filters.sort)
        : undefined,
    [fetched, filters.query, filters.sort],
  );

  // Filter chips only for fields that actually have experts, so a long field
  // list never shows as a row of empty categories.
  const { data: allExperts } = useExperts({});
  const chipIndustries = industries.filter((i) =>
    (allExperts ?? []).some((e) => e.industryId === i.id),
  );
  // Sorting or filtering by rating is pointless until someone has enough
  // reviews for a star average to show.
  const ratingsExist = (allExperts ?? []).some((e) => e.ratingCount >= MIN_REVIEWS_FOR_RATING);

  // Customers and experts launch together: anyone signed in without an expert
  // application sees the way into it on the home screen, whether or not
  // booking is open (the You tab entry stays, but is buried).
  const { data: myExpert, isFetched: myExpertFetched } = useMyExpertProfile();
  const showApplyCard = myExpertFetched && !myExpert;

  const applyCard = showApplyCard ? (
    <Pressable onPress={() => router.push('/expert-onboarding')} style={styles.applyCard}>
      <Text style={styles.applyTitle}>Become an expert</Text>
      <Text style={styles.applyBody}>
        Set your own price and get paid for 30-minute video sessions. Applying takes about
        four minutes.
      </Text>
      <Text style={styles.applyCta}>Start your application →</Text>
    </Pressable>
  ) : null;

  const noFiltersActive =
    !filters.industryId &&
    !filters.query &&
    filters.minRating === undefined &&
    filters.maxSessionPriceCents === undefined;
  const dbIsEmpty = !isLoading && experts && experts.length === 0 && noFiltersActive;
  // The home sections only make sense while browsing. Once someone searches
  // or filters, they want the list.
  const everyone = useMemo(() => allExperts ?? [], [allExperts]);
  const browsing = noFiltersActive;
  const openThisWeek = useMemo(() => availableWithin(everyone, 7), [everyone]);
  const fieldsWithExperts = chipIndustries;
  const showGuided = browsing && everyone.length >= GUIDED_MATCH_MIN_EXPERTS;
  const showOpenRow =
    browsing && everyone.length >= AVAILABLE_ROW_MIN_EXPERTS && openThisWeek.length > 0;
  const showFieldRows =
    browsing && everyone.length >= FIELD_ROWS_MIN_EXPERTS && fieldsWithExperts.length >= 2;
  const openExpert = (e: { id: string }) => router.push(`/expert/${e.id}`);

  const activeFilterCount =
    (filters.minRating !== undefined ? 1 : 0) +
    (filters.maxSessionPriceCents !== undefined ? 1 : 0) +
    (filters.sort !== 'recommended' ? 1 : 0);

  return (
    <Screen>
      {dbIsEmpty ? (
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.lg }}>
          <SectionHeader
            title="Talk to a human"
            caption={DISCOVER_CAPTION}
          />
          {applyCard}
          <EmptyState
            title="No experts yet"
            description="Be the first human on Palam. Your application takes about four minutes."
            emoji="🌱"
          />
        </View>
      ) : (
        <ExpertList
          experts={experts}
          isLoading={isLoading}
          onPressExpert={openExpert}
          ListEmptyComponent={<RequestExpert searched={filters.query || undefined} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <SectionHeader
                title="Talk to a human"
                caption={DISCOVER_CAPTION}
              />
              {applyCard}
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
                {chipIndustries.map((i) => (
                  <FilterChip
                    key={i.id}
                    label={`${i.emoji}  ${i.label}`}
                    active={filters.industryId === i.id}
                    onPress={() => setFilters({ ...filters, industryId: i.id })}
                  />
                ))}
              </ScrollView>
              {showGuided ? <GuidedMatch experts={everyone} onPressExpert={openExpert} /> : null}
              {showOpenRow ? (
                <ExpertRow
                  title="Available this week"
                  experts={openThisWeek}
                  onPressExpert={openExpert}
                />
              ) : null}
              {showFieldRows
                ? fieldsWithExperts.map((field) => (
                    <ExpertRow
                      key={field.id}
                      title={`${field.emoji}  ${field.label}`}
                      experts={sortExperts(
                        everyone.filter((e) => e.industryId === field.id),
                        'recommended',
                      )}
                      onPressExpert={openExpert}
                    />
                  ))
                : null}
              {showGuided || showOpenRow || showFieldRows ? (
                <Text style={styles.allTitle}>All experts</Text>
              ) : null}
            </View>
          }
        />
      )}

      <FilterSheet
        visible={filtersOpen}
        filters={filters}
        ratingsExist={ratingsExist}
        onClose={() => setFiltersOpen(false)}
        onChange={(next) => setFilters({ ...filters, ...next })}
        onReset={() =>
          setFilters({
            ...filters,
            minRating: undefined,
            maxSessionPriceCents: undefined,
            sort: 'recommended',
          })
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
  ratingsExist,
  onClose,
  onChange,
  onReset,
}: {
  visible: boolean;
  filters: Filters;
  ratingsExist: boolean;
  onClose: () => void;
  onChange: (next: Partial<Filters>) => void;
  onReset: () => void;
}) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <Pressable style={styles.sheetBackdrop} onPress={onClose} />
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>Sort and filter</Text>

      <Text style={styles.sheetLabel}>Sort by</Text>
      <View style={styles.sheetOptions}>
        {SORT_OPTIONS.filter((o) => ratingsExist || o.value !== 'rating').map((o) => {
          const active = filters.sort === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange({ sort: o.value })}
              style={[chipStyles.chip, active && chipStyles.chipActive]}
            >
              <Text style={[chipStyles.text, active && chipStyles.textActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {ratingsExist ? (
        <>
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
        </>
      ) : null}

      <Text style={styles.sheetLabel}>Price per session</Text>
      <View style={styles.sheetOptions}>
        {PRICE_OPTIONS.map((o) => {
          const active = filters.maxSessionPriceCents === o.value;
          return (
            <Pressable
              key={o.label}
              onPress={() => onChange({ maxSessionPriceCents: o.value })}
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
  applyCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  allTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm },
  applyTitle: { ...typography.heading, color: colors.textPrimary },
  applyBody: { ...typography.body, color: colors.textSecondary },
  applyCta: { ...typography.bodyStrong, color: colors.accent, marginTop: spacing.xs },
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
