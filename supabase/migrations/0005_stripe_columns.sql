-- 0005_stripe_columns
-- Track Stripe state on profiles, expert_profiles, and bookings.
-- Paste into Supabase SQL editor and Run. Safe to re-run.

-- Customer-side Stripe identity (one Stripe Customer per profile).
alter table public.profiles
  add column if not exists stripe_customer_id text;

-- Expert-side Stripe Connect account (set up later via Connect onboarding).
alter table public.expert_profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false;

-- Booking-level Stripe state — Checkout session + PaymentIntent IDs so the
-- webhook can look up which booking a Stripe event refers to.
alter table public.bookings
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

create index if not exists bookings_stripe_session_idx
  on public.bookings(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists bookings_stripe_pi_idx
  on public.bookings(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
