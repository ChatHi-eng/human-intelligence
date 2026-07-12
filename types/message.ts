export type Conversation = {
  id: string;
  customerId: string;
  expertId: string;
  otherPartyName: string;
  otherPartyAvatarUrl: string | null;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageSenderId: string | null;
  unread: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};
