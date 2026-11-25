-- 0034_payout_hold
-- An expert's money for a session stays in their Stripe balance until the
-- session has happened and been settled, then Palam sends it to their bank:
-- 48 hours after the scheduled finish. Held there, a refund for a no-show can
-- pull it straight back; before this, it had usually left for the bank
-- before the session took place and Palam had to cover the refund.
--
-- How: each expert's Stripe account is switched to manual payouts
-- (expert_profiles.payouts_held_at says when), every payment taken after
-- that is marked 'held' on its booking, and send-reminders pays each one out
-- when it falls due (supabase/functions/_shared/payouts.ts).
--
-- Safe to re-run.

alter table public.app_config
  add column if not exists payout_hold_hours integer not null default 48;

-- When this expert's Stripe account was switched to manual payouts. Null
-- until then: Stripe is still paying them out on its own schedule.
alter table public.expert_profiles
  add column if not exists payouts_held_at timestamptz;

create or replace function public.protect_payout_hold()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.payouts_held_at := null;
    else
      new.payouts_held_at := old.payouts_held_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_payout_hold on public.expert_profiles;
create trigger protect_payout_hold
  before insert or update on public.expert_profiles
  for each row
  execute function public.protect_payout_hold();

revoke execute on function public.protect_payout_hold() from public, anon, authenticated;

-- Where a booking's payout stands.
--   held            in the expert's Stripe balance, waiting for the session
--   releasing       being sent right now
--   released        sent to the expert's bank (stripe_payout_id)
--   approved        the owner says pay it at the next run, whatever else
--   on_hold         the owner says do not pay it until told otherwise
--   paid_by_stripe  taken before the hold began; Stripe paid it out itself
-- Null: nothing to pay out (free intro, or the expert had no Stripe account
-- when the customer paid).
alter table public.bookings
  add column if not exists payout_state text,
  add column if not exists payout_released_at timestamptz,
  add column if not exists stripe_payout_id text,
  add column if not exists payout_note text;

alter table public.bookings
  drop constraint if exists bookings_payout_state_check;
alter table public.bookings
  add constraint bookings_payout_state_check
  check (
    payout_state is null
    or payout_state in ('held', 'releasing', 'released', 'approved', 'on_hold', 'paid_by_stripe')
  );

create index if not exists bookings_payout_due_idx
  on public.bookings (end_at)
  where payout_state in ('held', 'releasing', 'approved');

-- A payment that lands while the expert's account is on hold is held.
create or replace function public.mark_payout_held()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'captured'
     and (tg_op = 'INSERT' or old.payment_status is distinct from 'captured')
     and new.payout_state is null
     and new.stripe_application_fee_cents is not null
     and exists (
       select 1 from public.expert_profiles e
       where e.profile_id = new.expert_profile_id
         and e.payouts_held_at is not null
     )
  then
    new.payout_state := 'held';
  end if;
  return new;
end;
$$;

drop trigger if exists mark_payout_held on public.bookings;
create trigger mark_payout_held
  before insert or update on public.bookings
  for each row
  execute function public.mark_payout_held();

revoke execute on function public.mark_payout_held() from public, anon, authenticated;

-- The app itself can never write any of these. (Named to run after
-- mark_payout_held: triggers fire in name order.)
create or replace function public.protect_booking_payout()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.payout_state := null;
      new.payout_released_at := null;
      new.stripe_payout_id := null;
      new.payout_note := null;
    else
      new.payout_state := old.payout_state;
      new.payout_released_at := old.payout_released_at;
      new.stripe_payout_id := old.stripe_payout_id;
      new.payout_note := old.payout_note;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_booking_payout on public.bookings;
create trigger protect_booking_payout
  before insert or update on public.bookings
  for each row
  execute function public.protect_booking_payout();

revoke execute on function public.protect_booking_payout() from public, anon, authenticated;

-- One more once-only message: the owner is told when a payout is overdue.
alter table public.booking_reminders
  drop constraint if exists booking_reminders_kind_check;
alter table public.booking_reminders
  add constraint booking_reminders_kind_check
  check (kind in (
    'day_before', 'hour_before', 'starting_soon', 'respond_nudge',
    'other_waiting', 'review_prompt', 'roll_call', 'attendance_result',
    'payout_overdue'
  ));

-- The owner, from the SQL editor:
--   Pay one out at the next run, whatever the record says:
--     update public.bookings set payout_state = 'approved' where id = '<booking id>';
--   Stop one being paid out (a complaint came in):
--     update public.bookings set payout_state = 'on_hold' where id = '<booking id>';
--   Let it go again:
--     update public.bookings set payout_state = 'held' where id = '<booking id>';
--   What is being held, and until when:
--     select id, expert_profile_id, end_at, price_cents - stripe_application_fee_cents as cents,
--            payout_state, attendance_outcome, payout_note
--     from public.bookings where payout_state in ('held', 'on_hold', 'approved', 'releasing')
--     order by end_at;
