import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { ExpertCard } from '@/components/expert/ExpertCard';
import { colors, spacing } from '@/constants/theme';
import type { Expert } from '@/types/user';

export type ExpertListProps = {
  experts: Expert[] | undefined;
  isLoading: boolean;
  onPressExpert: (expert: Expert) => void;
  ListHeaderComponent?: React.ReactElement;
  /** Shown when nothing matches. Defaults to a plain "no match" message. */
  ListEmptyComponent?: React.ReactElement;
};

// Dense people-list — compact rows with hairline separators so many experts
// fit per screen.
export const ExpertList = ({
  experts,
  isLoading,
  onPressExpert,
  ListHeaderComponent,
  ListEmptyComponent,
}: ExpertListProps) => {
  if (isLoading && !experts) return <LoadingView label="Finding experts…" />;
  // One list for both cases, so the search box in the header keeps focus
  // when a search stops matching.
  return (
    <FlatList
      data={experts ?? []}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        ListEmptyComponent ?? (
        <EmptyState
          title="No experts match"
          description="Try fewer words, another field, or a wider price range."
          emoji="🔍"
        />
        )
      }
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => (
        <ExpertCard expert={item} onPress={() => onPressExpert(item)} />
      )}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={ListHeaderComponent}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 64 + spacing.md,
  },
});
