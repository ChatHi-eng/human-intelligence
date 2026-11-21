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
import { Icon, type IconName } from '@/components/ui/Icon';
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
import { colors, radius, shadow, spacing, typography } from '@/constants/theme';
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
    <Pressable
      onPress={() => router.push('/expert-onboarding')}
      style={({ pressed }) => [styles.applyCard, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.applyTitle}>Become an expert</Text>
        <Text style={styles.applyBody}>
          Set your own price and get paid for 30-minute video sessions. Applying takes about
          four minutes.
        </Text>
        <Text style={styles.applyCta}>Start your application</Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.textPrimary} />
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
          <SectionHeader level="page" title="Talk to a human" caption={DISCOVER_CAPTION} />
          {applyCard}
          <EmptyState
            title="No experts yet"
            description="Be the first human on Palam. Your application takes about four minutes."
            icon="users"
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
              <SectionHeader level="page" title="Talk to a human" caption={DISCOVER_CAPTION} />
              <View style={styles.searchRow}>
                <View style={styles.search}>
                  <Icon name="search" size={18} color={colors.textPrimary} />
                  <TextInput
                    placeholder="Search by expertise, name…"
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                    value={filters.query}
                    onChangeText={(query) => setFilters({ ...filters, query })}
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                </View>
                <Pressable
                  onPress={() => setFiltersOpen(true)}
                  accessibilityLabel={
                    activeFilterCount > 0 ? `Filters, ${activeFilterCount} on` : 'Filters'
                  }
                  style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
                >
                  <Icon
                    name="sliders"
                    size={18}
                    color={activeFilterCount > 0 ? '#FFFFFF' : colors.textPrimary}
                  />
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                style={styles.chipsRow}
              >
                <FilterChip
                  label="All"
                  icon="grid"
                  active={filters.industryId === undefined}
                  onPress={() => setFilters({ ...filters, industryId: undefined })}
                />
                {chipIndustries.map((i) => (
                  <FilterChip
                    key={i.id}
                    label={i.label}
                    icon={i.icon}
                    active={filters.industryId === i.id}
                    onPress={() => setFilters({ ...filters, industryId: i.id })}
                  />
                ))}
              </ScrollView>
              {applyCard}
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
                      title={field.label}
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

// A field to browse by: a line icon over its name, underlined when chosen.
// Without an icon it is a plain choice chip (used in the filter sheet).
const FilterChip = ({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active: boolean;
  onPress: () => void;
}) =>
  icon ? (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={[chipStyles.tab, active && chipStyles.tabActive]}
    >
      <Icon name={icon} size={22} color={active ? colors.textPrimary : colors.textMuted} />
      <Text style={[chipStyles.tabText, active && chipStyles.tabTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  ) : (
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
  header: { paddingTop: spacing.lg, gap: spacing.lg, marginBottom: spacing.lg },
  applyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  allTitle: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm },
  applyTitle: { ...typography.bodyStrong, fontSize: 16, color: colors.textPrimary },
  applyBody: { ...typography.caption, color: colors.textSecondary },
  applyCta: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  // The search bar is the one floating thing on the screen.
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.floating,
  },
  searchInput: {
    flex: 1,
    height: 52,
    ...typography.body,
    lineHeight: undefined,
    color: colors.textPrimary,
    outlineStyle: 'none',
  } as object,
  filterButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterButtonActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipsRow: { borderBottomWidth: 1, borderBottomColor: colors.border, marginHorizontal: -spacing.lg },
  chips: { gap: spacing.xl, paddingHorizontal: spacing.lg },
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
  tab: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.md - 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.textPrimary },
  tabText: { ...typography.label, fontSize: 12, color: colors.textMuted },
  tabTextActive: { color: colors.textPrimary },
  chip: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { borderColor: colors.textPrimary, backgroundColor: colors.surface },
  text: { ...typography.body, color: colors.textPrimary },
  textActive: { fontFamily: 'Manrope_600SemiBold' },
});
