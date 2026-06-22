-- 0006_stripe_connect
-- Track application fee + transfer per booking so we can audit the split.
-- Paste into Supabase SQL editor and Run. Safe to re-run.

alter table public.bookings
  add column if not exists stripe_application_fee_cents integer
    check (stripe_application_fee_cents is null or stripe_application_fee_cents >= 0),
  add column if not exists stripe_transfer_id text;

create index if not exists expert_profiles_connect_idx
  on public.expert_profiles(stripe_connect_account_id)
  where stripe_connect_account_id is not null;
