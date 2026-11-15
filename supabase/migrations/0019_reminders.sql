-- 0019_reminders
-- Session reminders by email, text and push, for both customer and expert.
-- Safe to re-run.

-- 1. How each person wants to be reminded. Private: a phone number must
-- never sit in public.profiles, which every signed-in user can read.
create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_reminders boolean not null default true,
  sms_reminders boolean not null default false,
  -- E.164, e.g. +14155550123. Only used when sms_reminders is true.
  phone text,
  -- When the person ticked the consent box for texts.
  sms_consent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint notification_prefs_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint notification_prefs_sms_needs_phone
    check (not sms_reminders or (phone is not null and sms_consent_at is not null))
);

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs_select_own" on public.notification_prefs;
create policy "notification_prefs_select_own" on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notification_prefs_insert_own" on public.notification_prefs;
create policy "notification_prefs_insert_own" on public.notification_prefs
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "notification_prefs_update_own" on public.notification_prefs;
create policy "notification_prefs_update_own" on public.notification_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Push tokens, one row per device. Own rows only.
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_all_own" on public.push_tokens;
create policy "push_tokens_all_own" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Which reminders have gone out, so none is ever sent twice. Written only
-- by the send-reminders Edge Function (service role); no client policies.
create table if not exists public.booking_reminders (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('day_before', 'hour_before')),
  sent_at timestamptz not null default now(),
  primary key (booking_id, kind)
);

alter table public.booking_reminders enable row level security;

-- 4. The schedule (pg_cron calling the send-reminders function every ten
-- minutes) is NOT in this file, because it needs the webhook secret and this
-- repository is public. See the "Reminders" section of the README.
