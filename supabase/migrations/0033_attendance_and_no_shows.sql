-- 0033_attendance_and_no_shows
-- Palam decides a no-show from what the video room recorded, not from what
-- anyone reports. Each person enters the room with their own pass, the room
-- tells Palam when each one came and went, and ten minutes after the
-- scheduled finish the record is read and the session is settled:
--
--   held              together 20 minutes or more
--   short             together 5 to 20 minutes (stands as held)
--   expert_no_show    the customer came, the expert never did, or the expert
--                     had gone by minute 10 while the customer was there
--                     -> full refund, one strike
--   customer_no_show  the expert was there at minute 10 and for 5 of the
--                     first 10 minutes, the customer was not there
--                     -> no refund, the expert keeps the payout
--   needs_review      anything the record cannot settle. Nothing moves; the
--                     owner is told.
--
-- Safe to re-run.

-- 1. The numbers, in one place.
alter table public.app_config
  add column if not exists no_show_grace_minutes integer not null default 10,
  add column if not exists no_show_wait_minutes integer not null default 5,
  add column if not exists session_held_minutes integer not null default 20,
  add column if not exists session_floor_minutes integer not null default 5,
  add column if not exists no_show_strike_count integer not null default 2,
  add column if not exists no_show_strike_window_days integer not null default 90,
  -- Off: an expert no-show is still decided and recorded, but the refund is
  -- left for the owner to issue.
  add column if not exists auto_refund_expert_no_show boolean not null default true,
  -- Sessions that start before this are never settled automatically (they
  -- were held before the room kept a record).
  add column if not exists attendance_live_from timestamptz;

update public.app_config
set attendance_live_from = now()
where attendance_live_from is null;

-- 2. The room, and what was decided, on the booking.
alter table public.bookings
  add column if not exists daily_room_url text,
  add column if not exists daily_room_private boolean not null default false,
  add column if not exists attendance_outcome text,
  add column if not exists attendance_decided_at timestamptz,
  add column if not exists attendance_detail jsonb,
  add column if not exists no_show_strike boolean not null default false,
  add column if not exists stripe_refund_id text;

alter table public.bookings
  drop constraint if exists bookings_attendance_outcome_check;
alter table public.bookings
  add constraint bookings_attendance_outcome_check
  check (
    attendance_outcome is null
    or attendance_outcome in ('held', 'short', 'expert_no_show', 'customer_no_show', 'needs_review')
  );

-- The app itself can never write any of these.
create or replace function public.protect_booking_attendance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.daily_room_url := null;
      new.daily_room_private := false;
      new.attendance_outcome := null;
      new.attendance_decided_at := null;
      new.attendance_detail := null;
      new.no_show_strike := false;
      new.stripe_refund_id := null;
    else
      new.daily_room_url := old.daily_room_url;
      new.daily_room_private := old.daily_room_private;
      new.attendance_outcome := old.attendance_outcome;
      new.attendance_decided_at := old.attendance_decided_at;
      new.attendance_detail := old.attendance_detail;
      new.no_show_strike := old.no_show_strike;
      new.stripe_refund_id := old.stripe_refund_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_booking_attendance on public.bookings;
create trigger protect_booking_attendance
  before insert or update on public.bookings
  for each row
  execute function public.protect_booking_attendance();

revoke execute on function public.protect_booking_attendance() from public, anon, authenticated;

-- A booking that moves to a new time starts with a clean record.
create or replace function public.reset_attendance_on_move()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_at is distinct from old.start_at and new.attendance_decided_at is null then
    -- The room is set up again, for the new time, the next time it is opened.
    new.daily_room_private := false;
    new.daily_room_url := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_attendance_on_move on public.bookings;
create trigger reset_attendance_on_move
  before update of start_at on public.bookings
  for each row
  execute function public.reset_attendance_on_move();

revoke execute on function public.reset_attendance_on_move() from public, anon, authenticated;

-- 3. Every time someone was in a booking's room: one row per visit.
create table if not exists public.call_sessions (
  session_id text primary key,
  booking_id uuid references public.bookings(id) on delete cascade,
  room text not null,
  role text check (role is null or role in ('customer', 'expert')),
  user_ref text,
  joined_at timestamptz,
  left_at timestamptz,
  duration_seconds numeric,
  source text not null default 'webhook' check (source in ('webhook', 'meetings')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_sessions_booking_idx on public.call_sessions (booking_id);
create index if not exists call_sessions_room_idx on public.call_sessions (room);

-- Only Palam's own functions read or write it.
alter table public.call_sessions enable row level security;
revoke all on public.call_sessions from anon, authenticated;

-- 4. The line the room reports on (one row). The signing secret is made by
-- Palam's own function and never leaves the database.
create table if not exists public.daily_webhook (
  id boolean primary key default true check (id),
  hmac text not null,
  webhook_uuid text,
  state text,
  failed_count integer,
  checked_at timestamptz,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.daily_webhook enable row level security;
revoke all on public.daily_webhook from anon, authenticated;

-- 5. Two more once-only messages: the minute-10 notice and the result.
alter table public.booking_reminders
  drop constraint if exists booking_reminders_kind_check;
alter table public.booking_reminders
  add constraint booking_reminders_kind_check
  check (kind in (
    'day_before', 'hour_before', 'starting_soon', 'respond_nudge',
    'other_waiting', 'review_prompt', 'roll_call', 'attendance_result'
  ));

-- 6. Strikes. A strike is a booking with no_show_strike set. Enough of them
-- inside the window and the profile is paused until the owner has looked.
create or replace function public.pause_after_no_show_strikes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_days integer;
  v_count integer;
begin
  select coalesce(no_show_strike_count, 2), coalesce(no_show_strike_window_days, 90)
    into v_limit, v_days
  from public.app_config limit 1;
  v_limit := coalesce(v_limit, 2);
  v_days := coalesce(v_days, 90);
  -- A limit of zero switches the automatic pause off.
  if v_limit <= 0 then
    return new;
  end if;

  select count(*) into v_count
  from public.bookings
  where expert_profile_id = new.expert_profile_id
    and no_show_strike
    and start_at > now() - make_interval(days => v_days);

  if v_count >= v_limit then
    update public.expert_profiles
    set paused = true,
        palam_paused_at = now(),
        palam_pause_reason = 'no_shows'
    where profile_id = new.expert_profile_id
      and palam_paused_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists auto_pause_after_no_show on public.bookings;
create trigger auto_pause_after_no_show
  after update on public.bookings
  for each row
  when (new.no_show_strike and not old.no_show_strike)
  execute function public.pause_after_no_show_strikes();

revoke execute on function public.pause_after_no_show_strikes() from public, anon, authenticated;

-- The owner, from the SQL editor:
--   Excuse a strike (a Palam or video fault, a real emergency):
--     update public.bookings set no_show_strike = false where id = '<booking id>';
--   Lift a pause:
--     update public.expert_profiles
--     set paused = false, palam_paused_at = null, palam_pause_reason = null
--     where profile_id = '<expert id>';
--   See who was in the room for a booking, and when:
--     select role, joined_at, left_at, duration_seconds, source
--     from public.call_sessions where booking_id = '<booking id>' order by joined_at;
