-- 0009_expert_application_status
-- Supply-first launch: becoming an expert is now an application. Every expert
-- is personally reviewed before appearing on Discover.
-- Paste into Supabase SQL editor and Run. Safe to re-run.

-- status: 'pending' (application submitted, hidden from Discover),
-- 'approved' (live), or 'rejected' (politely closed).
-- The column is added with default 'approved' so every EXISTING expert stays
-- live, then the default flips to 'pending' so every NEW application starts
-- under review. Re-running is a no-op either way — no pending application can
-- be accidentally approved.
alter table public.expert_profiles
  add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected'));

alter table public.expert_profiles
  alter column status set default 'pending';

-- LinkedIn URL collected on the application form — the main thing the owner
-- checks when reviewing an applicant.
alter table public.expert_profiles
  add column if not exists linkedin_url text;

-- Discover filters on status = 'approved'.
create index if not exists expert_profiles_status_idx
  on public.expert_profiles(status);

-- To review applications: Supabase dashboard → Table Editor → expert_profiles →
-- filter status = 'pending' → check headline + linkedin_url → set status to
-- 'approved' or 'rejected'. The app picks the change up on next refetch.
