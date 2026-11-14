-- 0017_application_v3_fields
-- Expert application v3: a broad field list with "type your own", a
-- LinkedIn-style current role, and topic tags.
-- Paste into the Supabase SQL editor and Run. Safe to re-run.

-- The applicant's own field name when they pick "Something else"
-- (industry_id = 'other').
alter table public.expert_profiles
  add column if not exists industry_custom text;

-- Current role, shown publicly as "Title at Company".
alter table public.expert_profiles
  add column if not exists current_title text;

alter table public.expert_profiles
  add column if not exists current_company text;

-- Specific things the expert can be asked about, shown as chips on the
-- profile and included in Discover search.
alter table public.expert_profiles
  add column if not exists topics text[] not null default '{}';
