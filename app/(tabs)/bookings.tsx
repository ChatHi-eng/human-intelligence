import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { BookingCard } from '@/components/booking/BookingCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useMyBookings } from '@/hooks/useBookings';
import { useExperts, useMyExpertProfile } from '@/hooks/useExperts';

type Segment = 'customer' | 'expert';

export default function BookingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: bookings, isLoading } = useMyBookings();
  const { data: experts } = useExperts();
  const { data: myExpertProfile } = useMyExpertProfile();
  const isExpert = Boolean(myExpertProfile);
  const expertsById = new Map(experts?.map((e) => [e.id, e]) ?? []);

  const asCustomer = useMemo(
    () => (bookings ?? []).filter((b) => user && b.customerId === user.id),
    [bookings, user],
  );
  const asExpert = useMemo(
    () => (bookings ?? []).filter((b) => user && b.expertId === user.id),
    [bookings, user],
  );

  // Default segment: whichever side has the next upcoming session.
  const defaultSegment: Segment = useMemo(() => {
    if (!isExpert) return 'customer';
    const now = Date.now();
    const nextCustomer = asCustomer.find((b) => new Date(b.slot.startIso).getTime() > now);
    const nextExpert = asExpert.find((b) => new Date(b.slot.startIso).getTime() > now);
    if (!nextExpert) return 'customer';
    if (!nextCustomer) return 'expert';
    return new Date(nextCustomer.slot.startIso).getTime() <
      new Date(nextExpert.slot.startIso).getTime()
      ? 'customer'
      : 'expert';
  }, [asCustomer, asExpert, isExpert]);

  const [segment, setSegment] = useState<Segment>(defaultSegment);

  if (isLoading && !bookings) return <LoadingView label="Loading your bookings…" />;

  const list = isExpert ? (segment === 'customer' ? asCustomer : asExpert) : asCustomer;
  const viewerIsExpert = isExpert && segment === 'expert';

  // Upcoming sessions first (soonest at the top), then history, newest first.
  const nowMs = Date.now();
  const isUpcoming = (b: (typeof list)[number]) =>
    (b.status === 'requested' || b.status === 'confirmed' || b.status === 'in_progress') &&
    new Date(b.slot.endIso).getTime() >= nowMs;
  const upcoming = list.filter(isUpcoming);
  const past = list.filter((b) => !isUpcoming(b)).reverse();
  const sections = [
    { title: 'Upcoming', data: upcoming },
    { title: 'Past and cancelled', data: past },
  ].filter((s) => s.data.length > 0);

  return (
    <Screen>
      {isExpert && (
        <View style={styles.segment}>
          <Pressable
            onPress={() => setSegment('customer')}
            style={[styles.segItem, segment === 'customer' && styles.segItemActive]}
          >
            <Text style={[styles.segText, segment === 'customer' && styles.segTextActive]}>
              As customer
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSegment('expert')}
            style={[styles.segItem, segment === 'expert' && styles.segItemActive]}
          >
            <Text style={[styles.segText, segment === 'expert' && styles.segTextActive]}>
              As expert
            </Text>
          </Pressable>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(b) => b.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionLabel}>{section.title}</Text>
        )}
        ListHeaderComponent={
          <SectionHeader
            level="page"
            title="Your bookings"
            caption={
              isExpert
                ? segment === 'customer'
                  ? 'Sessions you booked with other experts.'
                  : "Sessions customers booked with you."
                : 'Upcoming and past sessions.'
            }
          />
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            expert={expertsById.get(item.expertId)}
            viewerIsExpert={viewerIsExpert}
            onPress={() => router.push(`/booking/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <EmptyState
            title={
              isExpert && segment === 'expert' ? 'No bookings from customers' : 'No bookings yet'
            }
            description={
              isExpert && segment === 'expert'
                ? 'When customers book you, they show up here.'
                : 'Find an expert from Discover and book your first session.'
            }
            icon="calendar"
          />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  segItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  segItemActive: { backgroundColor: colors.background, ...shadowIfy() },
  segText: { ...typography.bodyStrong, color: colors.textSecondary },
  segTextActive: { color: colors.textPrimary },
});

function shadowIfy() {
  return {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  };
}
