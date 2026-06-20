-- 0003_background_and_availability
-- Paste into Supabase SQL editor and Run. Safe to re-run.

-- ============================================================================
-- credentials → background entries (work / education / certification / other)
-- ============================================================================

alter table public.credentials
  add column if not exists type text not null default 'other'
    check (type in ('work', 'education', 'certification', 'other')),
  add column if not exists end_year smallint check (end_year between 1900 and 2100);

-- ============================================================================
-- expert_profiles: free-form "what can I help with?" pitch
-- ============================================================================

alter table public.expert_profiles
  add column if not exists how_i_can_help text;

-- ============================================================================
-- availability_dates: one-off availability on specific dates
-- (additive to the weekly recurring windows; both contribute to bookable slots)
-- ============================================================================

create table if not exists public.availability_dates (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles(profile_id) on delete cascade,
  date date not null,
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  created_at timestamptz not null default now()
);

create index if not exists availability_dates_expert_date_idx
  on public.availability_dates(expert_profile_id, date);

alter table public.availability_dates enable row level security;

drop policy if exists "availability_dates_select_all" on public.availability_dates;
create policy "availability_dates_select_all" on public.availability_dates
  for select to authenticated using (true);

drop policy if exists "availability_dates_write_own" on public.availability_dates;
create policy "availability_dates_write_own" on public.availability_dates
  for all to authenticated
  using (expert_profile_id = auth.uid())
  with check (expert_profile_id = auth.uid());
