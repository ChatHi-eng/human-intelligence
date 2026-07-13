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
};

// Dense people-list — compact rows with hairline separators so many experts
// fit per screen.
export const ExpertList = ({
  experts,
  isLoading,
  onPressExpert,
  ListHeaderComponent,
}: ExpertListProps) => {
  if (isLoading && !experts) return <LoadingView label="Finding experts…" />;
  if (!experts || experts.length === 0) {
    return (
      <View style={styles.empty}>
        {ListHeaderComponent}
        <EmptyState
          title="No experts match those filters"
          description="Try widening your industry or budget."
          emoji="🔍"
        />
      </View>
    );
  }
  return (
    <FlatList
      data={experts}
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
  empty: { gap: spacing.lg },
});
