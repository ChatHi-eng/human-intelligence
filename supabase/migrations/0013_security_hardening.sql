-- 0013_security_hardening
-- Fixes from the November 2026 security audit — see SECURITY.md at the repo
-- root for the full findings list and evidence.
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
--
-- ⚠️ ORDER MATTERS — do these FIRST, then run this migration:
--   1. Redeploy the five updated Edge Functions from this commit:
--      create-checkout-session, refund-booking, create-daily-room,
--      create-connect-account, sync-connect-status (Verify JWT stays OFF).
--      They now write privileged columns (Stripe ids, payment status, room
--      URLs) with the service role. If this migration runs while the OLD
--      versions are still deployed, those writes are silently discarded by
--      the new guard triggers and payments stop reconciling.
--   2. Apply any earlier migrations you haven't run yet (0008, 0011, 0012) —
--      the messaging hardening below is skipped with a NOTICE if 0008's
--      tables don't exist yet; re-run this file after applying 0008.
--
-- Also: do NOT re-run 0001 after this migration — it would recreate the old
-- wide-open expert_profiles select policy that this file replaces.
--
-- What this migration does, in one line each:
--   A. Rating aggregates now recompute as the database owner (they silently
--      failed under RLS before — and clients could write them directly).
--   B. Pending/rejected expert applications are visible only to the applicant.
--   C. Clients can no longer set status / verified / ratings / Stripe Connect
--      state on expert_profiles — API writes to those columns are ignored.
--   D. Bookings: price is forced server-side to the expert's current rate;
--      payment status, Stripe ids, Daily room fields and the parties/time of
--      a booking can't be set or changed through the public API.
--   E. profiles.stripe_customer_id can't be set through the public API.
--   F. Messaging (if 0008 is applied): conversation parties are immutable,
--      and an expert can only open a conversation with a customer who has a
--      booking with them.
--
-- The guards are BEFORE-triggers keyed on current_user: PostgREST requests
-- run as the 'anon' / 'authenticated' Postgres roles, so only API traffic is
-- guarded. The dashboard SQL editor / Table Editor (postgres), the service
-- role, and SECURITY DEFINER functions are unaffected.

-- ============================================================================
-- A) Rating aggregates: recompute as owner (SECURITY DEFINER).
-- Before: the function ran as the calling user, so RLS on expert_profiles
-- filtered the UPDATE to zero rows whenever a CUSTOMER posted a review —
-- rating_average / rating_count never moved. As a definer function it both
-- works and passes through the column guard below.
-- ============================================================================

create or replace function public.recompute_expert_rating(p_expert uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.expert_profiles
  set
    rating_average = coalesce(
      (select round(avg(rating)::numeric, 2) from public.reviews where expert_profile_id = p_expert),
      0
    ),
    rating_count = (select count(*) from public.reviews where expert_profile_id = p_expert)
  where profile_id = p_expert;
end;
$$;

-- ============================================================================
-- B) expert_profiles: applications are private to the applicant.
-- Replaces the 0001 policy that let every signed-in user read every row —
-- including status='pending' rows carrying linkedin_url and (after 0011)
-- application_goal / resume_url.
-- ============================================================================

drop policy if exists "expert_profiles_select_all" on public.expert_profiles;
drop policy if exists "expert_profiles_select_approved_or_own" on public.expert_profiles;
create policy "expert_profiles_select_approved_or_own" on public.expert_profiles
  for select to authenticated
  using (status = 'approved' or profile_id = auth.uid());

-- ============================================================================
-- C) expert_profiles: privileged columns are server-owned.
-- The 0001 insert/update policies check WHO writes (the row owner) but not
-- WHAT they write — so the row owner could set their own status, verified
-- badge, rating aggregates, or Stripe Connect state through the REST API.
-- This guard forces safe values on INSERT and keeps the stored values on
-- UPDATE for API-role writers; app code never sends these columns, so
-- nothing user-facing changes.
-- ============================================================================

create or replace function public.protect_expert_profiles_columns()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.verified := false;
      new.rating_average := 0;
      new.rating_count := 0;
      new.stripe_connect_account_id := null;
      new.stripe_connect_payouts_enabled := false;
    else
      new.status := old.status;
      new.verified := old.verified;
      new.rating_average := old.rating_average;
      new.rating_count := old.rating_count;
      new.stripe_connect_account_id := old.stripe_connect_account_id;
      new.stripe_connect_payouts_enabled := old.stripe_connect_payouts_enabled;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_expert_profiles_columns on public.expert_profiles;
create trigger protect_expert_profiles_columns
before insert or update on public.expert_profiles
for each row execute function public.protect_expert_profiles_columns();

-- ============================================================================
-- D) bookings: payment-critical columns are server-owned.
-- INSERT: the price is whatever the expert currently charges — the client's
-- value is overwritten, so a hand-crafted REST insert can't book at $0.01.
-- Status/payment fields start at their safe defaults and Stripe/Daily fields
-- start empty no matter what the client sends.
-- UPDATE: parties can still change status / cancellation_reason (and future
-- columns like the 0012 no-show fields), but the price, the payment state,
-- Stripe correlation ids, the call room URL, and the who/when of the booking
-- keep their stored values. Only the Edge Functions (service role) and the
-- Stripe webhook write those.
-- ============================================================================

create or replace function public.protect_bookings_columns()
returns trigger language plpgsql
as $$
declare
  v_rate integer;
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      select hourly_rate_cents into v_rate
      from public.expert_profiles
      where profile_id = new.expert_profile_id;
      if v_rate is null then
        -- Also hit when the expert isn't visible to the booker (not approved).
        raise exception 'This expert cannot be booked yet';
      end if;
      new.price_cents := v_rate;
      new.status := 'requested';
      new.payment_status := 'pending';
      new.cancellation_reason := null;
      new.call_room_url := null;
      new.stripe_checkout_session_id := null;
      new.stripe_payment_intent_id := null;
      new.stripe_application_fee_cents := null;
      new.stripe_transfer_id := null;
      new.daily_room_name := null;
      new.daily_room_expires_at := null;
    else
      new.customer_id := old.customer_id;
      new.expert_profile_id := old.expert_profile_id;
      new.start_at := old.start_at;
      new.end_at := old.end_at;
      new.medium := old.medium;
      new.price_cents := old.price_cents;
      new.payment_status := old.payment_status;
      new.call_room_url := old.call_room_url;
      new.stripe_checkout_session_id := old.stripe_checkout_session_id;
      new.stripe_payment_intent_id := old.stripe_payment_intent_id;
      new.stripe_application_fee_cents := old.stripe_application_fee_cents;
      new.stripe_transfer_id := old.stripe_transfer_id;
      new.daily_room_name := old.daily_room_name;
      new.daily_room_expires_at := old.daily_room_expires_at;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_bookings_columns on public.bookings;
create trigger protect_bookings_columns
before insert or update on public.bookings
for each row execute function public.protect_bookings_columns();

-- ============================================================================
-- E) profiles: stripe_customer_id is server-owned.
-- Unused by the app today, but the 0001 update policy would have let a user
-- point their own row at an arbitrary Stripe customer id.
-- ============================================================================

create or replace function public.protect_profiles_columns()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.stripe_customer_id := null;
    else
      new.id := old.id;
      new.created_at := old.created_at;
      new.stripe_customer_id := old.stripe_customer_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profiles_columns on public.profiles;
create trigger protect_profiles_columns
before insert or update on public.profiles
for each row execute function public.protect_profiles_columns();

-- ============================================================================
-- F) Messaging (only if 0008 is applied; skipped with a NOTICE otherwise).
--   * conversations_insert_party previously accepted ANY customer_id as long
--     as the writer was the expert side — an expert could open a conversation
--     "from" any user. Now: customers start conversations themselves, and an
--     expert can only start one with a customer who has a booking with them
--     (the in-app flow starts expert-side chats from the booking screen).
--   * A guard trigger keeps the parties and created_at immutable; only the
--     read pointers (and the trigger-driven last_message_at) stay writable.
-- ============================================================================

create or replace function public.protect_conversations_columns()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and tg_op = 'UPDATE' then
    new.id := old.id;
    new.customer_id := old.customer_id;
    new.expert_profile_id := old.expert_profile_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

do $do$
begin
  if to_regclass('public.conversations') is null then
    raise notice '0008 not applied yet — messaging hardening skipped. Re-run 0013 after applying 0008.';
    return;
  end if;

  execute 'drop policy if exists "conversations_insert_party" on public.conversations';
  execute $pol$
    create policy "conversations_insert_party" on public.conversations
      for insert to authenticated
      with check (
        customer_id = auth.uid()
        or (
          expert_profile_id = auth.uid()
          and exists (
            select 1 from public.bookings b
            where b.expert_profile_id = auth.uid()
              and b.customer_id = conversations.customer_id
          )
        )
      )
  $pol$;

  execute 'drop trigger if exists protect_conversations_columns on public.conversations';
  execute 'create trigger protect_conversations_columns
           before insert or update on public.conversations
           for each row execute function public.protect_conversations_columns()';
end;
$do$;
