-- 0023_free_intro
-- Owner decision of 15 Nov 2026: experts may offer a free 15-minute intro
-- call in hours they choose. One per customer per expert, and the expert sets
-- how many they take in a week. Safe to re-run.

-- 1. The expert's switch and weekly limit.
alter table public.expert_profiles
  add column if not exists intro_enabled boolean not null default false;
alter table public.expert_profiles
  add column if not exists intro_weekly_limit integer not null default 3;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expert_profiles_intro_weekly_limit_range') then
    alter table public.expert_profiles
      add constraint expert_profiles_intro_weekly_limit_range
      check (intro_weekly_limit between 1 and 20);
  end if;
end $$;

-- 2. Weekly hours are either for paid sessions or for free intros.
alter table public.availability_windows
  add column if not exists kind text not null default 'session';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'availability_windows_kind_values') then
    alter table public.availability_windows
      add constraint availability_windows_kind_values check (kind in ('session', 'intro'));
  end if;
end $$;

-- 3. What kind of booking this is.
alter table public.bookings
  add column if not exists kind text not null default 'session';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_kind_values') then
    alter table public.bookings
      add constraint bookings_kind_values check (kind in ('session', 'intro'));
  end if;
end $$;

-- 4. A free intro has no payment at all.
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in
    ('pending', 'authorized', 'captured', 'refunded', 'failed', 'released', 'not_required'));

-- 5. Who may book a free intro. Runs with definer rights because the weekly
-- count has to see other customers' bookings, which row-level security hides
-- from the person booking.
create or replace function public.enforce_intro_rules()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_enabled boolean;
  v_limit integer;
  v_week_start timestamptz;
begin
  if new.kind is distinct from 'intro' then
    return new;
  end if;

  select intro_enabled, intro_weekly_limit into v_enabled, v_limit
  from public.expert_profiles
  where profile_id = new.expert_profile_id and status = 'approved';
  if not coalesce(v_enabled, false) then
    raise exception 'This expert is not offering free intro calls.';
  end if;

  if exists (
    select 1 from public.bookings b
    where b.kind = 'intro'
      and b.customer_id = new.customer_id
      and b.expert_profile_id = new.expert_profile_id
      and b.status <> 'cancelled'
  ) then
    raise exception 'You have already had a free intro with this expert.';
  end if;

  v_week_start := date_trunc('week', new.start_at);
  if (
    select count(*) from public.bookings b
    where b.kind = 'intro'
      and b.expert_profile_id = new.expert_profile_id
      and b.status <> 'cancelled'
      and b.start_at >= v_week_start
      and b.start_at < v_week_start + interval '7 days'
  ) >= v_limit then
    raise exception 'This expert''s free intro calls are full that week. Try another week.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_intro_rules on public.bookings;
create trigger enforce_intro_rules
before insert on public.bookings
for each row execute function public.enforce_intro_rules();

-- 6. The column guard (0014, 0022) learns about intros: always 15 minutes,
-- always free, never a payment. An instant-booking expert's intro is
-- confirmed on the spot; an approve-first expert's waits for their answer.
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
      new.booking_mode := case when coalesce(v_auto, true) then 'instant' else 'approval' end;
      if new.kind = 'intro' then
        new.end_at := new.start_at + interval '15 minutes';
        new.price_cents := 0;
        new.payment_status := 'not_required';
        if new.booking_mode = 'instant' then
          new.status := 'confirmed';
          new.requested_at := null;
        else
          new.status := 'requested';
          new.requested_at := now();
        end if;
      else
        if v_rate is null then
          -- Also hit when the expert isn't visible to the booker (not approved).
          raise exception 'This expert cannot be booked yet';
        end if;
        new.kind := 'session';
        -- A session is always 30 minutes, whatever end time the client sent,
        -- so nobody can book a longer call at the 30-minute price.
        new.end_at := new.start_at + interval '30 minutes';
        new.price_cents := v_rate;
        new.status := 'requested';
        new.payment_status := 'pending';
        new.requested_at := null;
      end if;
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
      new.kind := old.kind;
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

-- 7. The overlap guard (0018, 0020) works out the real length itself. It
-- runs before the column guard above, so it must not trust the end time the
-- client sent either.
create or replace function public.prevent_double_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_paused boolean;
  v_gap interval;
  v_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(new.expert_profile_id::text));

  select paused, make_interval(mins => buffer_minutes)
    into v_paused, v_gap
  from public.expert_profiles
  where profile_id = new.expert_profile_id;

  if coalesce(v_paused, false) then
    raise exception 'This expert is not taking bookings right now.';
  end if;

  v_end := new.start_at
    + case when new.kind = 'intro' then interval '15 minutes' else interval '30 minutes' end;

  if exists (
    select 1 from public.bookings b
    where b.expert_profile_id = new.expert_profile_id
      and b.status in ('requested', 'confirmed', 'in_progress')
      and b.start_at < v_end + coalesce(v_gap, interval '0')
      and b.end_at + coalesce(v_gap, interval '0') > new.start_at
  ) then
    raise exception 'That time was just taken. Please pick another.';
  end if;
  return new;
end;
$$;
