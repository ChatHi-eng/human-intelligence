-- 0010_application_webhook
-- Email alerts for expert applications: a database trigger POSTs every
-- expert_profiles INSERT/UPDATE to the notify-application Edge Function,
-- which emails the owner (new application) or the applicant (approved).
--
-- BEFORE RUNNING:
--   1. Set the WEBHOOK_SECRET Edge Function secret (any long random string):
--      Supabase → Edge Functions → Secrets.
--   2. Replace __WEBHOOK_SECRET__ below with that exact same value.
-- The function rejects any request whose x-webhook-secret header doesn't match.
--
-- If Run errors with "schema supabase_functions does not exist", enable
-- Database Webhooks first (Supabase dashboard → Database → Webhooks →
-- Enable webhooks), then re-run.
-- Paste into Supabase SQL editor and Run. Safe to re-run.

drop trigger if exists expert_profiles_notify_application on public.expert_profiles;

-- supabase_functions.http_request is Supabase's Database Webhooks mechanism:
-- for each changed row it POSTs {type, table, schema, record, old_record} as
-- JSON to the URL, with the headers given here.
create trigger expert_profiles_notify_application
  after insert or update
  on public.expert_profiles
  for each row
  execute function supabase_functions.http_request(
    'https://dthpwxpxjhbsgzcjnept.supabase.co/functions/v1/notify-application',
    'POST',
    '{"Content-type":"application/json","x-webhook-secret":"__WEBHOOK_SECRET__"}',
    '{}',
    '5000'
  );
