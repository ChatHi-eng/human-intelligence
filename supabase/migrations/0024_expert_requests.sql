-- 0024_expert_requests
-- Owner decision of 15 Nov 2026: when a search finds nobody, the customer can
-- say what they need and the owner answers personally. Safe to re-run.

create table if not exists public.expert_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- What they need, in their own words.
  need text not null check (char_length(need) between 10 and 600),
  -- What they had searched or picked when nothing matched, if anything.
  searched text check (searched is null or char_length(searched) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists expert_requests_user_created_idx
  on public.expert_requests (user_id, created_at desc);

alter table public.expert_requests enable row level security;

-- A person can file and see their own requests. The owner reads them all in
-- the Supabase table editor (service role), and gets each one by email from
-- the request-expert Edge Function.
drop policy if exists "expert_requests_insert_own" on public.expert_requests;
create policy "expert_requests_insert_own" on public.expert_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "expert_requests_select_own" on public.expert_requests;
create policy "expert_requests_select_own" on public.expert_requests
  for select to authenticated using (user_id = auth.uid());
