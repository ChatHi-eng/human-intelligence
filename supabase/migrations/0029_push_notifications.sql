-- 0029_push_notifications
-- Notifications on the device itself, for the web app as well as the phone
-- app: booking requests, confirmations, cancellations and reminders.
-- Safe to re-run.

-- 1. A browser's push subscription sits in push_tokens beside phone tokens.
-- For a browser, `token` is the address its push service gave it and these
-- two columns are the keys messages to it are encrypted with.
alter table public.push_tokens
  add column if not exists p256dh text,
  add column if not exists auth text;

-- 2. The server's own key pair for Web Push. Created by the `push` Edge
-- Function the first time it is needed, so no secret is typed in anywhere.
-- Row level security with no policies: only the service role can read it.
create table if not exists public.push_keys (
  id boolean primary key default true check (id),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;

-- 3. Each person's time zone, as their browser reports it, so emails and
-- notifications can say the time the way that person will read it.
alter table public.notification_prefs
  add column if not exists timezone text;

alter table public.notification_prefs
  drop constraint if exists notification_prefs_timezone_length;
alter table public.notification_prefs
  add constraint notification_prefs_timezone_length
  check (timezone is null or char_length(timezone) between 1 and 64);

-- 4. A third reminder, about ten minutes before the start. ('respond_nudge'
-- is the expert's halfway nudge on an unanswered request, migration 0022.)
alter table public.booking_reminders
  drop constraint if exists booking_reminders_kind_check;
alter table public.booking_reminders
  add constraint booking_reminders_kind_check
  check (kind in ('day_before', 'hour_before', 'starting_soon', 'respond_nudge'));
