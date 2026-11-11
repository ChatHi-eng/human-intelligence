-- 0016_public_expert_profiles
-- Shareable public expert profiles: lets the ANONYMOUS web (the app.palamapp.com
-- web build, running with only the anon key and no session) read exactly the
-- surface a public marketplace profile needs — and nothing else.
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
--
-- Product decision (owner-approved, Nov 2026): every APPROVED expert gets a
-- public link https://app.palamapp.com/expert/<id> for their LinkedIn bio.
-- Approved profiles (headline, pitch, rate, years, display name, avatar,
-- reviews, availability) become world-readable. Pending/rejected applications
-- and all vetting material stay private.
--
-- ⚠️ VETTING FIELDS — KNOWN LIMITATION, READ THIS:
-- RLS is ROW-level, not column-level. The anon policies below expose whole
-- rows of expert_profiles where status = 'approved' — including the vetting
-- columns resume_url, application_goal and linkedin_url on those rows. A
-- crafted anon REST query COULD select them. Our own anon API consumer (the
-- public web page) must therefore NEVER select those columns: services/api.ts
-- uses an explicit column list (EXPERT_SELECT) that omits resume_url and
-- application_goal — keep it that way. resume_url is additionally only a
-- storage path in the private 'resumes' bucket (0011: select_own only), so
-- even a leaked value does not serve the file. If you want a hard guarantee
-- later, the fix is column-level privileges:
--   revoke select on public.expert_profiles from anon;
--   grant select (profile_id, status, industry_id, headline, ...) on
--     public.expert_profiles to anon;
-- (not done here to keep PostgREST '*' behavior predictable for authenticated
-- clients and because approved rows carry no resume by design).
--
-- Reviewer privacy (intentional): reviews embed profiles(display_name,
-- avatar_url) for the reviewer. Reviewers are customers, not approved experts,
-- so the anon profiles policy below does NOT match their rows — the embed
-- returns null and the public page shows "Customer". Signed-in users still
-- see reviewer names (0001 authenticated policy unchanged).
--
-- Images: avatars and cover-images buckets were already public (0002), so
-- avatar/cover URLs render for anon without any change here.

-- ============================================================================
-- expert_profiles: anon reads APPROVED rows only.
-- Safe because approval is owner-controlled (status is server-owned since
-- 0014's column guard) — nothing reaches this surface until a human flips a
-- row to 'approved'. Pending/rejected applications stay invisible to anon.
-- ============================================================================

drop policy if exists "expert_profiles_select_anon_approved" on public.expert_profiles;
create policy "expert_profiles_select_anon_approved" on public.expert_profiles
  for select to anon
  using (status = 'approved');

-- ============================================================================
-- profiles: anon reads ONLY the profile row behind an approved expert.
-- Safe because it exposes exactly the identity an approved expert has chosen
-- to publish (display_name, avatar_url, bio) — customers' and applicants'
-- profile rows never match the predicate. Required for the public page at
-- all: EXPERT_SELECT embeds profiles!inner, so without this the inner join
-- would drop the expert row for anon.
-- ============================================================================

drop policy if exists "profiles_select_anon_approved_expert" on public.profiles;
create policy "profiles_select_anon_approved_expert" on public.profiles
  for select to anon
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.profile_id = profiles.id and ep.status = 'approved'
    )
  );

-- ============================================================================
-- reviews: anon reads reviews OF approved experts.
-- Safe because reviews are the public social proof of a public profile; rows
-- carry no customer identity beyond customer_id (a bare uuid — the reviewer's
-- name/avatar stay hidden, see header note), and reviews of unapproved
-- experts stay invisible.
-- ============================================================================

drop policy if exists "reviews_select_anon_approved_expert" on public.reviews;
create policy "reviews_select_anon_approved_expert" on public.reviews
  for select to anon
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.profile_id = reviews.expert_profile_id and ep.status = 'approved'
    )
  );

-- ============================================================================
-- credentials: anon reads the background entries of approved experts.
-- Safe because credentials are authored by the expert FOR their public
-- profile ("Background" section); applicants' entries stay hidden until
-- approval.
-- ============================================================================

drop policy if exists "credentials_select_anon_approved_expert" on public.credentials;
create policy "credentials_select_anon_approved_expert" on public.credentials
  for select to anon
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.profile_id = credentials.expert_profile_id and ep.status = 'approved'
    )
  );

-- ============================================================================
-- availability_windows / availability_dates: anon reads approved experts'
-- offered slots. Safe because availability is marketing ("this expert has
-- times this week"), contains no booking/customer data, and only shows what
-- the expert deliberately offers; EXPERT_SELECT embeds both tables, so the
-- public page errors without these.
-- ============================================================================

drop policy if exists "availability_select_anon_approved_expert" on public.availability_windows;
create policy "availability_select_anon_approved_expert" on public.availability_windows
  for select to anon
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.profile_id = availability_windows.expert_profile_id and ep.status = 'approved'
    )
  );

drop policy if exists "availability_dates_select_anon_approved_expert" on public.availability_dates;
create policy "availability_dates_select_anon_approved_expert" on public.availability_dates
  for select to anon
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.profile_id = availability_dates.expert_profile_id and ep.status = 'approved'
    )
  );
