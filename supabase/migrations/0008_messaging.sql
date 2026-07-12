-- 0008_messaging
-- One conversation per customer↔expert pair; messages within it.
-- Paste into Supabase SQL editor and Run. Safe to re-run.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  expert_profile_id uuid not null references public.expert_profiles(profile_id) on delete cascade,
  last_message_at timestamptz not null default now(),
  -- Per-side read pointers: unread = last_message_at > my pointer.
  customer_last_read_at timestamptz not null default now(),
  expert_last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (customer_id, expert_profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists conversations_customer_idx
  on public.conversations(customer_id, last_message_at desc);
create index if not exists conversations_expert_idx
  on public.conversations(expert_profile_id, last_message_at desc);
create index if not exists messages_conversation_idx
  on public.messages(conversation_id, created_at desc);

-- Bump the conversation's last_message_at whenever a message lands.
create or replace function public.messages_after_insert()
returns trigger language plpgsql
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
after insert on public.messages
for each row execute function public.messages_after_insert();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversations_select_party" on public.conversations;
create policy "conversations_select_party" on public.conversations
  for select to authenticated
  using (customer_id = auth.uid() or expert_profile_id = auth.uid());

drop policy if exists "conversations_insert_party" on public.conversations;
create policy "conversations_insert_party" on public.conversations
  for insert to authenticated
  with check (customer_id = auth.uid() or expert_profile_id = auth.uid());

-- Parties can update (read pointers; last_message_at via trigger).
drop policy if exists "conversations_update_party" on public.conversations;
create policy "conversations_update_party" on public.conversations
  for update to authenticated
  using (customer_id = auth.uid() or expert_profile_id = auth.uid())
  with check (customer_id = auth.uid() or expert_profile_id = auth.uid());

drop policy if exists "messages_select_party" on public.messages;
create policy "messages_select_party" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.customer_id = auth.uid() or c.expert_profile_id = auth.uid())
    )
  );

drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.customer_id = auth.uid() or c.expert_profile_id = auth.uid())
    )
  );
