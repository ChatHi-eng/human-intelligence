-- 0011_application_upgrade
-- Upgraded expert application: resume upload, optional hourly rate
-- ("I'll decide later"), and a private motivation question for the vetting team.
-- Paste into the Supabase SQL editor and click Run. Safe to re-run.
--
-- Apply BEFORE running an app build that contains the new wizard — new
-- applications write resume_url / application_goal and may submit a null rate,
-- all of which error until this runs.

-- ============================================================================
-- 1) PRIVATE 'resumes' BUCKET
-- Unlike avatars/cover-images this bucket is NOT public: a resume is vetting
-- material, not profile content. Only the uploader can read their own file
-- from the app; the vetting team opens it from the dashboard (service role
-- bypasses RLS). 10 MB cap, PDF / .doc / .docx only.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Same path convention as the other buckets: resumes/<user_id>/<filename>.
-- storage.foldername(name)[1] is the first path segment = the uploader's id.

drop policy if exists "resumes_select_own" on storage.objects;
create policy "resumes_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_insert_own" on storage.objects;
create policy "resumes_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_update_own" on storage.objects;
create policy "resumes_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_delete_own" on storage.objects;
create policy "resumes_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 2) NEW APPLICATION COLUMNS
-- resume_url: the STORAGE PATH inside the resumes bucket (e.g.
--   "5a3e…/resume.pdf"), not a public URL — the bucket is private.
-- application_goal: "What do you hope to get out of Palam?" — read by the
--   vetting team only, never selected by any customer-facing query.
-- ============================================================================

alter table public.expert_profiles
  add column if not exists resume_url text;

alter table public.expert_profiles
  add column if not exists application_goal text;

-- ============================================================================
-- 3) OPTIONAL HOURLY RATE
-- Applicants can pick "I'll decide later": the rate is stored as NULL.
-- The app shows "Rate coming soon" for a null-rate expert and blocks booking
-- until they set one. Existing rows keep their rates — only the NOT NULL
-- constraint is relaxed.
-- ============================================================================

alter table public.expert_profiles
  alter column hourly_rate_cents drop not null;

alter table public.expert_profiles
  drop constraint if exists expert_profiles_hourly_rate_cents_check;

alter table public.expert_profiles
  add constraint expert_profiles_hourly_rate_cents_check
  check (hourly_rate_cents is null or hourly_rate_cents >= 0);

-- ============================================================================
-- Reviewing applications after this migration:
--   Table Editor → expert_profiles → filter status = 'pending' → check
--   headline, how_i_can_help, linkedin_url, application_goal, years_experience.
--   To open an applicant's resume: Storage → resumes → open the folder named
--   with the applicant's profile_id → click the file → Download.
--   Then set status to 'approved' or 'rejected' as before.
-- ============================================================================
