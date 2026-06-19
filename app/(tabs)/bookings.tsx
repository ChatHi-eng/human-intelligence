import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { BookingCard } from '@/components/booking/BookingCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { spacing } from '@/constants/theme';
import { useMyBookings } from '@/hooks/useBookings';
import { useExperts } from '@/hooks/useExperts';

export default function BookingsScreen() {
  const router = useRouter();
  const { data: bookings, isLoading } = useMyBookings();
  const { data: experts } = useExperts();
  const expertsById = new Map(experts?.map((e) => [e.id, e]) ?? []);

  if (isLoading && !bookings) return <LoadingView label="Loading your bookings…" />;

  return (
    <Screen>
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        ListHeaderComponent={
          <SectionHeader title="Your bookings" caption="Upcoming and past sessions." />
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            expert={expertsById.get(item.expertId)}
            onPress={() => router.push(`/booking/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <EmptyState
            title="No bookings yet"
            description="Find an expert and book your first call."
            emoji="📅"
          />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
});
