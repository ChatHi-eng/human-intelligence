import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { LoadingView } from '@/components/ui/LoadingView';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  useConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
} from '@/hooks/useMessages';
import { formatTime } from '@/lib/date';
import type { Message } from '@/types/message';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: conversation } = useConversation(id);
  const { data: messages, isLoading } = useMessages(id);
  const { mutate: send, isPending: sending } = useSendMessage();
  const { mutate: markRead } = useMarkConversationRead();
  const [draft, setDraft] = useState('');
  const lastMarkedRef = useRef<string | null>(null);

  // Mark read whenever new messages arrive while the thread is open.
  useEffect(() => {
    if (!conversation || !user || !messages || messages.length === 0) return;
    const newest = messages[0];
    if (!newest || newest.senderId === user.id) return;
    if (lastMarkedRef.current === newest.id) return;
    lastMarkedRef.current = newest.id;
    markRead({
      conversationId: conversation.id,
      viewerIsCustomer: conversation.customerId === user.id,
    });
  }, [messages, conversation, user, markRead]);

  if (isLoading && !messages) return <LoadingView label="Loading conversation…" />;

  const onSend = () => {
    const body = draft.trim();
    if (!body || !id) return;
    setDraft('');
    send(
      { conversationId: id, body },
      {
        onError: (err) => {
          setDraft(body); // restore what they typed
          Toast.show({
            type: 'error',
            text1: 'Could not send',
            text2: err instanceof Error ? err.message : 'Unknown error',
          });
        },
      },
    );
  };

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: conversation?.otherPartyName ?? 'Chat' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={messages ?? []}
          keyExtractor={(m) => m.id}
          inverted
          renderItem={({ item }) => <Bubble message={item} mine={item.senderId === user?.id} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                Start the conversation — introductions, questions, scheduling details.
              </Text>
            </View>
          }
        />
        <View style={styles.inputBar}>
          <TextInput
            placeholder="Write a message…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            style={styles.input}
            maxLength={4000}
          />
          <Pressable
            onPress={onSend}
            disabled={sending || !draft.trim()}
            style={[styles.sendButton, (!draft.trim() || sending) && { opacity: 0.4 }]}
          >
            <Text style={styles.sendLabel}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const Bubble = ({ message, mine }: { message: Message; mine: boolean }) => (
  <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.body}</Text>
      <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
        {formatTime(message.createdAt)}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  emptyWrap: { padding: spacing.xl, transform: [{ scaleY: -1 }] },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  bubbleRow: { flexDirection: 'row' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    gap: 2,
  },
  bubbleMine: { backgroundColor: colors.textPrimary, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: radius.sm },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTime: { ...typography.label, color: colors.textMuted, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.6)' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sendButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendLabel: { ...typography.bodyStrong, color: '#FFFFFF' },
});
