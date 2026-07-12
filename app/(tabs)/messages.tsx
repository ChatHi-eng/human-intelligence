import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, spacing, typography } from '@/constants/theme';
import { useConversations } from '@/hooks/useMessages';
import { formatDay } from '@/lib/date';

export default function MessagesScreen() {
  const router = useRouter();
  const { data: conversations, isLoading } = useConversations();

  if (isLoading && !conversations) return <LoadingView label="Loading messages…" />;

  return (
    <Screen>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<SectionHeader title="Messages" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <Avatar uri={item.otherPartyAvatarUrl} name={item.otherPartyName} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, item.unread && styles.nameUnread]}>
                {item.otherPartyName}
              </Text>
              <Text
                style={[styles.preview, item.unread && styles.previewUnread]}
                numberOfLines={1}
              >
                {item.lastMessageBody ?? 'Say hello 👋'}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.time}>{formatDay(item.lastMessageAt)}</Text>
              {item.unread && <View style={styles.unreadDot} />}
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            title="No conversations yet"
            description="Message an expert from their profile, or a customer from a booking."
            emoji="💬"
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  nameUnread: { color: colors.textPrimary },
  preview: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  previewUnread: { color: colors.textPrimary, fontWeight: '600' },
  metaCol: { alignItems: 'flex-end', gap: spacing.xs },
  time: { ...typography.caption, color: colors.textMuted },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
