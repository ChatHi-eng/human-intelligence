-- 0022_booking_modes
-- Owner decisions of 15 Nov 2026:
--   * Booking is instant by default: pick a time, pay, confirmed.
--   * An expert can switch on "Approve requests first". For them the card is
--     only held; it is charged when they accept and released if they decline
--     or do not answer in time.
-- Safe to re-run.

-- 1. The expert's choice. true = instant booking.
alter table public.expert_profiles
  add column if not exists auto_accept boolean not null default true;

-- 2. Which path a booking took, fixed when it is created, so emails and
-- screens can word things correctly even if the expert changes their setting.
alter table public.bookings
  add column if not exists booking_mode text not null default 'approval';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_booking_mode_values') then
    alter table public.bookings
      add constraint bookings_booking_mode_values
      check (booking_mode in ('instant', 'approval'));
  end if;
end $$;

-- 3. When a request became real (the card hold succeeded). The expiry clock
-- for approve-first requests starts here.
alter table public.bookings
  add column if not exists requested_at timestamptz;

-- 4. A hold that was let go without charging is 'released', which is not a
-- refund: nothing ever left the customer's account.
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('pending', 'authorized', 'captured', 'refunded', 'failed', 'released'));

-- 5. One nudge to the expert halfway through the response window.
alter table public.booking_reminders drop constraint if exists booking_reminders_kind_check;
alter table public.booking_reminders
  add constraint booking_reminders_kind_check
  check (kind in ('day_before', 'hour_before', 'respond_nudge'));

-- 6. The column guard from 0014, extended:
--   INSERT: also stamps booking_mode from the expert's setting.
--   UPDATE: a signed-in person may cancel, or mark a finished session
--   completed, but can no longer flip a request to 'confirmed' by hand.
--   Accepting goes through the respond-to-booking Edge Function, which
--   charges the held card first. booking_mode, requested_at and the
--   customer's note keep their stored values.
create or replace function public.protect_bookings_columns()
returns trigger language plpgsql set search_path = public
as $$
declare
  v_rate integer;
  v_auto boolean;
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      select hourly_rate_cents, auto_accept into v_rate, v_auto
      from public.expert_profiles
      where profile_id = new.expert_profile_id;
      if v_rate is null then
        -- Also hit when the expert isn't visible to the booker (not approved).
        raise exception 'This expert cannot be booked yet';
      end if;
      new.price_cents := v_rate;
      new.booking_mode := case when coalesce(v_auto, true) then 'instant' else 'approval' end;
      new.status := 'requested';
      new.payment_status := 'pending';
      new.requested_at := null;
      new.cancellation_reason := null;
      new.decline_reason := null;
      new.call_room_url := null;
      new.stripe_checkout_session_id := null;
      new.stripe_payment_intent_id := null;
      new.stripe_application_fee_cents := null;
      new.stripe_transfer_id := null;
      new.daily_room_name := null;
      new.daily_room_expires_at := null;
    else
      if new.status is distinct from old.status
         and new.status not in ('cancelled', 'completed') then
        raise exception 'Accepting a booking has to go through Palam';
      end if;
      if new.status = 'completed' and old.status not in ('confirmed', 'in_progress', 'completed') then
        raise exception 'Only a confirmed session can be completed';
      end if;
      new.customer_id := old.customer_id;
      new.expert_profile_id := old.expert_profile_id;
      new.start_at := old.start_at;
      new.end_at := old.end_at;
      new.medium := old.medium;
      new.price_cents := old.price_cents;
      new.booking_mode := old.booking_mode;
      new.requested_at := old.requested_at;
      new.customer_note := old.customer_note;
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
