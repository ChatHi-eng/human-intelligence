-- 0013_lifecycle_email_webhooks
-- Transactional "lifecycle" emails: database triggers POST every profiles
-- INSERT and every bookings INSERT/UPDATE to the lifecycle-emails Edge
-- Function, which turns row transitions into emails (welcome, booking
-- request, confirmation, cancellation, refund, no-show report).
-- (0011 and 0012 belong to the expert-application revamp and no-show policy.)
--
-- BEFORE RUNNING:
--   1. Deploy the lifecycle-emails Edge Function (Verify JWT OFF) — see the
--      "Lifecycle emails" section of the README.
--   2. Replace __WEBHOOK_SECRET__ below (it appears twice) with the exact
--      value of the WEBHOOK_SECRET Edge Function secret — the same one
--      migration 0010 uses.
-- The function rejects any request whose x-webhook-secret header doesn't match.
--
-- If Run errors with "schema supabase_functions does not exist", enable
-- Database Webhooks first (Supabase dashboard → Database → Webhooks →
-- Enable webhooks), then re-run.
-- Paste into Supabase SQL editor and Run. Safe to re-run.

drop trigger if exists profiles_lifecycle_emails on public.profiles;

-- supabase_functions.http_request is Supabase's Database Webhooks mechanism:
-- for each changed row it POSTs {type, table, schema, record, old_record} as
-- JSON to the URL, with the headers given here.
create trigger profiles_lifecycle_emails
  after insert
  on public.profiles
  for each row
  execute function supabase_functions.http_request(
    'https://dthpwxpxjhbsgzcjnept.supabase.co/functions/v1/lifecycle-emails',
    'POST',
    '{"Content-type":"application/json","x-webhook-secret":"__WEBHOOK_SECRET__"}',
    '{}',
    '5000'
  );

drop trigger if exists bookings_lifecycle_emails on public.bookings;

create trigger bookings_lifecycle_emails
  after insert or update
  on public.bookings
  for each row
  execute function supabase_functions.http_request(
    'https://dthpwxpxjhbsgzcjnept.supabase.co/functions/v1/lifecycle-emails',
    'POST',
    '{"Content-type":"application/json","x-webhook-secret":"__WEBHOOK_SECRET__"}',
    '{}',
    '5000'
  );
