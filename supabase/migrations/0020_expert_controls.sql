-- 0020_expert_controls
-- Owner decisions of 15 Nov 2026: pause my profile, a gap between sessions,
-- and an optional reason when an expert declines. Safe to re-run.

-- 1. Pause. A paused expert is hidden from Discover and cannot be booked,
-- but keeps their hours for when they come back.
alter table public.expert_profiles
  add column if not exists paused boolean not null default false;

-- 2. Minutes kept free on either side of every booked session.
alter table public.expert_profiles
  add column if not exists buffer_minutes integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expert_profiles_buffer_minutes_range'
  ) then
    alter table public.expert_profiles
      add constraint expert_profiles_buffer_minutes_range
      check (buffer_minutes between 0 and 120);
  end if;
end $$;

-- 3. Why the expert said no: 'time', 'not_a_fit' or 'other'. Separate from
-- cancellation_reason, which the email and refund code match on exactly.
alter table public.bookings
  add column if not exists decline_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_decline_reason_values'
  ) then
    alter table public.bookings
      add constraint bookings_decline_reason_values
      check (decline_reason is null or decline_reason in ('time', 'not_a_fit', 'other'));
  end if;
end $$;

-- 4. The booking guard from 0018 now also refuses paused experts and keeps
-- the expert's gap free around existing sessions.
create or replace function public.prevent_double_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_paused boolean;
  v_gap interval;
begin
  perform pg_advisory_xact_lock(hashtext(new.expert_profile_id::text));

  select paused, make_interval(mins => buffer_minutes)
    into v_paused, v_gap
  from public.expert_profiles
  where profile_id = new.expert_profile_id;

  if coalesce(v_paused, false) then
    raise exception 'This expert is not taking bookings right now.';
  end if;

  if exists (
    select 1 from public.bookings b
    where b.expert_profile_id = new.expert_profile_id
      and b.status in ('requested', 'confirmed', 'in_progress')
      and b.start_at < new.end_at + coalesce(v_gap, interval '0')
      and b.end_at + coalesce(v_gap, interval '0') > new.start_at
  ) then
    raise exception 'That time was just taken. Please pick another.';
  end if;
  return new;
end;
$$;
