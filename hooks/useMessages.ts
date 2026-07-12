import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchConversation,
  fetchConversations,
  fetchMessages,
  getOrCreateConversation,
  markConversationRead,
  sendMessage,
} from '@/services/api';
import { useAuthStore } from '@/store/authStore';

export const useConversations = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['conversations', userId],
    enabled: Boolean(userId),
    queryFn: () => (userId ? fetchConversations(userId) : Promise.resolve([])),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
};

export const useConversation = (id: string | undefined) => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['conversation', id, userId],
    enabled: Boolean(id && userId),
    queryFn: () =>
      id && userId ? fetchConversation(id, userId) : Promise.resolve(null),
  });
};

export const useMessages = (conversationId: string | undefined) =>
  useQuery({
    queryKey: ['messages', conversationId],
    enabled: Boolean(conversationId),
    queryFn: () => (conversationId ? fetchMessages(conversationId) : Promise.resolve([])),
    // Polling stands in for realtime until the dev build.
    refetchInterval: 5_000,
  });

export const useSendMessage = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversationId: string; body: string }) => {
      if (!userId) throw new Error('Not signed in');
      await sendMessage(input.conversationId, userId, input.body);
    },
    onSuccess: (_d, input) => {
      void qc.invalidateQueries({ queryKey: ['messages', input.conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

// Opens (or creates) the conversation between a customer and an expert, then
// returns its id for navigation.
export const useOpenConversation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { customerId: string; expertId: string }) =>
      getOrCreateConversation(input.customerId, input.expertId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export const useMarkConversationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; viewerIsCustomer: boolean }) =>
      markConversationRead(input.conversationId, input.viewerIsCustomer),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};
