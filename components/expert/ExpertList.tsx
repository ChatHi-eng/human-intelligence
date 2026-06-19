import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { ExpertCard } from '@/components/expert/ExpertCard';
import { spacing } from '@/constants/theme';
import type { Expert } from '@/types/user';

export type ExpertListProps = {
  experts: Expert[] | undefined;
  isLoading: boolean;
  onPressExpert: (expert: Expert) => void;
  ListHeaderComponent?: React.ReactElement;
};

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
      renderItem={({ item }) => <ExpertCard expert={item} onPress={() => onPressExpert(item)} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
      ListHeaderComponent={ListHeaderComponent}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl, gap: 0 },
  empty: { gap: spacing.lg },
});
