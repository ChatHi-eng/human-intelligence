import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';

export default function MessagesScreen() {
  return (
    <Screen>
      <SectionHeader title="Messages" caption="Threads with your experts will appear here." />
      <EmptyState
        title="No conversations yet"
        description="Once you book a session, you'll be able to chat with your expert here."
        emoji="💬"
      />
    </Screen>
  );
}
