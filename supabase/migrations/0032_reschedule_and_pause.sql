-- 0032_reschedule_and_pause
-- Moving a booking instead of cancelling it, and pausing an expert who keeps
-- cancelling late. Safe to re-run.
--
--   A customer moves a confirmed booking to any open time, free, until 24
--   hours before the start.
--   An expert suggests up to three new times; the booking only moves if the
--   customer picks one. A move the customer accepted is never held against
--   the expert.
--   A booking can be moved twice in all.
--   Two late cancellations by an expert within 90 days pause their profile
--   until Palam lifts it.
--
-- The three numbers live in app_config so they can be changed without a
-- release, and the app reads them from there for its wording.

-- 1. The owner's settings.
alter table public.app_config
  add column if not exists late_cancel_pause_count integer not null default 2,
  add column if not exists late_cancel_window_days integer not null default 90,
  add column if not exists max_reschedules integer not null default 2;

-- 2. A pause only Palam can lift. It sets the ordinary `paused` flag, which
-- everything already respects, and records that Palam did it.
alter table public.expert_profiles
  add column if not exists palam_paused_at timestamptz,
  add column if not exists palam_pause_reason text;

create or replace function public.protect_palam_pause()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.palam_paused_at := null;
      new.palam_pause_reason := null;
    else
      new.palam_paused_at := old.palam_paused_at;
      new.palam_pause_reason := old.palam_pause_reason;
      -- An expert cannot switch themselves back on while Palam's pause stands.
      if old.palam_paused_at is not null then
        new.paused := true;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_palam_pause on public.expert_profiles;
create trigger protect_palam_pause
  before insert or update on public.expert_profiles
  for each row
  execute function public.protect_palam_pause();

revoke execute on function public.protect_palam_pause() from public, anon, authenticated;

-- 3. What a move leaves on the booking. The app cannot write these.
alter table public.bookings
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists rescheduled_by text,
  add column if not exists previous_start_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_rescheduled_by_check;
alter table public.bookings
  add constraint bookings_rescheduled_by_check
  check (rescheduled_by is null or rescheduled_by in ('customer', 'expert'));

create or replace function public.protect_booking_moves()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.reschedule_count := 0;
      new.rescheduled_at := null;
      new.rescheduled_by := null;
      new.previous_start_at := null;
    else
      new.reschedule_count := old.reschedule_count;
      new.rescheduled_at := old.rescheduled_at;
      new.rescheduled_by := old.rescheduled_by;
      new.previous_start_at := old.previous_start_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_booking_moves on public.bookings;
create trigger protect_booking_moves
  before insert or update on public.bookings
  for each row
  execute function public.protect_booking_moves();

revoke execute on function public.protect_booking_moves() from public, anon, authenticated;

-- 4. An expert's suggestion of new times, waiting on the customer.
create table if not exists public.reschedule_proposals (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  options timestamptz[] not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  chosen_start_at timestamptz,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint reschedule_proposals_options_count
    check (array_length(options, 1) between 1 and 3)
);

create unique index if not exists reschedule_proposals_one_pending
  on public.reschedule_proposals (booking_id) where status = 'pending';
create index if not exists reschedule_proposals_booking_idx
  on public.reschedule_proposals (booking_id, created_at desc);

alter table public.reschedule_proposals enable row level security;

-- Both people on the booking can read it. Every write goes through the
-- functions below.
drop policy if exists "reschedule_proposals_select_party" on public.reschedule_proposals;
create policy "reschedule_proposals_select_party" on public.reschedule_proposals
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = auth.uid() or b.expert_profile_id = auth.uid())
    )
  );

revoke insert, update, delete on public.reschedule_proposals from anon, authenticated;

-- 5. Is the expert free at this time, leaving their gap around other
-- sessions? The booking being moved does not count against itself.
create or replace function public.booking_time_is_free(
  p_expert uuid,
  p_booking uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1
    from public.bookings b
    where b.expert_profile_id = p_expert
      and b.id <> p_booking
      and b.status in ('requested', 'confirmed', 'in_progress')
      and b.start_at < p_end + make_interval(mins => coalesce(
        (select buffer_minutes from public.expert_profiles where profile_id = p_expert), 0))
      and b.end_at + make_interval(mins => coalesce(
        (select buffer_minutes from public.expert_profiles where profile_id = p_expert), 0)) > p_start
  );
$$;

-- 6. The move itself. Reminders start over for the new time, the old video
-- room is forgotten (join-call gives the room its new closing time), and a
-- waiting suggestion is settled.
create or replace function public.apply_booking_move(
  p_booking uuid,
  p_start timestamptz,
  p_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set previous_start_at = start_at,
      end_at = p_start + (end_at - start_at),
      start_at = p_start,
      reschedule_count = reschedule_count + 1,
      rescheduled_at = now(),
      rescheduled_by = p_by,
      call_room_url = null,
      daily_room_name = null,
      daily_room_expires_at = null,
      customer_joined_at = null,
      expert_joined_at = null
  where id = p_booking;

  delete from public.booking_reminders
  where booking_id = p_booking
    and kind in ('day_before', 'hour_before', 'starting_soon', 'other_waiting', 'review_prompt');
end;
$$;

-- 7. A customer moves their own confirmed booking.
create or replace function public.reschedule_booking(p_booking uuid, p_start timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_max integer;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or auth.uid() is null or b.customer_id <> auth.uid() then
    raise exception 'Booking not found.';
  end if;
  if b.status <> 'confirmed' then
    raise exception 'Only a confirmed booking can be moved.';
  end if;
  if b.start_at - now() <= interval '24 hours' then
    raise exception 'The time can be changed until 24 hours before the start. It is too late to move this one.';
  end if;
  select coalesce(max_reschedules, 2) into v_max from public.app_config limit 1;
  if b.reschedule_count >= coalesce(v_max, 2) then
    raise exception 'This booking has already been moved as many times as it can be.';
  end if;
  if p_start is null or p_start <= now() + interval '1 hour' or p_start > now() + interval '60 days' then
    raise exception 'Pick a time that is still open.';
  end if;
  if p_start = b.start_at then
    raise exception 'That is the time you already have.';
  end if;

  perform pg_advisory_xact_lock(hashtext(b.expert_profile_id::text));
  if not public.booking_time_is_free(
    b.expert_profile_id, b.id, p_start, p_start + (b.end_at - b.start_at)
  ) then
    raise exception 'That time was just taken. Please pick another.';
  end if;

  update public.reschedule_proposals
  set status = 'withdrawn', responded_at = now()
  where booking_id = b.id and status = 'pending';

  perform public.apply_booking_move(b.id, p_start, 'customer');
  return p_start;
end;
$$;

-- 8. An expert suggests up to three new times.
create or replace function public.propose_reschedule(p_booking uuid, p_options timestamptz[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_max integer;
  v_options timestamptz[];
  v_option timestamptz;
  v_id uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or auth.uid() is null or b.expert_profile_id <> auth.uid() then
    raise exception 'Booking not found.';
  end if;
  if b.status <> 'confirmed' or b.start_at <= now() then
    raise exception 'Only a confirmed session that has not started can be moved.';
  end if;
  select coalesce(max_reschedules, 2) into v_max from public.app_config limit 1;
  if b.reschedule_count >= coalesce(v_max, 2) then
    raise exception 'This booking has already been moved as many times as it can be.';
  end if;

  select array_agg(distinct o order by o) into v_options from unnest(p_options) as o;
  if v_options is null or array_length(v_options, 1) > 3 then
    raise exception 'Suggest one, two or three times.';
  end if;

  perform pg_advisory_xact_lock(hashtext(b.expert_profile_id::text));
  foreach v_option in array v_options loop
    if v_option <= now() + interval '30 minutes' or v_option > now() + interval '60 days' then
      raise exception 'Each time has to be in the future.';
    end if;
    if v_option = b.start_at then
      raise exception 'One of those is the time the session already has.';
    end if;
    if not public.booking_time_is_free(
      b.expert_profile_id, b.id, v_option, v_option + (b.end_at - b.start_at)
    ) then
      raise exception 'You already have a session at one of those times.';
    end if;
  end loop;

  update public.reschedule_proposals
  set status = 'withdrawn', responded_at = now()
  where booking_id = b.id and status = 'pending';

  insert into public.reschedule_proposals (booking_id, proposed_by, options)
  values (b.id, auth.uid(), v_options)
  returning id into v_id;
  return v_id;
end;
$$;

-- 9. The customer picks one of the suggested times, or keeps the original
-- (p_choice null).
create or replace function public.respond_to_reschedule(p_proposal uuid, p_choice timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.reschedule_proposals;
  b public.bookings;
begin
  select * into p from public.reschedule_proposals where id = p_proposal for update;
  if p.id is null then
    raise exception 'That suggestion is no longer there.';
  end if;
  select * into b from public.bookings where id = p.booking_id for update;
  if b.id is null or auth.uid() is null or b.customer_id <> auth.uid() then
    raise exception 'That suggestion is no longer there.';
  end if;
  if p.status <> 'pending' then
    raise exception 'This suggestion has already been answered.';
  end if;

  if p_choice is null then
    update public.reschedule_proposals
    set status = 'declined', responded_at = now()
    where id = p.id;
    return 'declined';
  end if;

  if b.status <> 'confirmed' then
    raise exception 'This booking can no longer be moved.';
  end if;
  if not (p_choice = any (p.options)) then
    raise exception 'Pick one of the suggested times.';
  end if;
  if p_choice <= now() then
    raise exception 'That time has passed. Pick another, or keep the original.';
  end if;

  perform pg_advisory_xact_lock(hashtext(b.expert_profile_id::text));
  if not public.booking_time_is_free(
    b.expert_profile_id, b.id, p_choice, p_choice + (b.end_at - b.start_at)
  ) then
    raise exception 'That time has since been taken. Pick another, or keep the original.';
  end if;

  update public.reschedule_proposals
  set status = 'accepted', chosen_start_at = p_choice, responded_at = now()
  where id = p.id;
  perform public.apply_booking_move(b.id, p_choice, 'expert');
  return 'accepted';
end;
$$;

-- 10. The expert takes a suggestion back before it is answered.
create or replace function public.withdraw_reschedule(p_proposal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reschedule_proposals
  set status = 'withdrawn', responded_at = now()
  where id = p_proposal and status = 'pending' and proposed_by = auth.uid();
  if not found then
    raise exception 'That suggestion is no longer waiting.';
  end if;
end;
$$;

revoke execute on function public.booking_time_is_free(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.apply_booking_move(uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.reschedule_booking(uuid, timestamptz) from public, anon;
revoke execute on function public.propose_reschedule(uuid, timestamptz[]) from public, anon;
revoke execute on function public.respond_to_reschedule(uuid, timestamptz) from public, anon;
revoke execute on function public.withdraw_reschedule(uuid) from public, anon;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;
grant execute on function public.propose_reschedule(uuid, timestamptz[]) to authenticated;
grant execute on function public.respond_to_reschedule(uuid, timestamptz) to authenticated;
grant execute on function public.withdraw_reschedule(uuid) to authenticated;

-- 11. Tell lifecycle-emails when a suggestion is made or answered, so the
-- other person hears about it. The shared secret is read from Vault, never
-- written here (this repository is public).
create or replace function public.notify_reschedule_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://dthpwxpxjhbsgzcjnept.supabase.co/functions/v1/lifecycle-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'palam_webhook_secret')
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', 'reschedule_proposals',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    )
  );
  return new;
end;
$$;

drop trigger if exists reschedule_proposals_notify on public.reschedule_proposals;
create trigger reschedule_proposals_notify
  after insert or update on public.reschedule_proposals
  for each row
  execute function public.notify_reschedule_proposal();

revoke execute on function public.notify_reschedule_proposal() from public, anon, authenticated;

-- 12. The automatic pause. When an expert's late cancellation is recorded
-- (migration 0031) and it brings them to the limit within the window, their
-- profile is paused: hidden from Discover and closed to new bookings, with
-- the sessions they already have left alone.
create or replace function public.pause_after_late_cancellations()
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
  select coalesce(late_cancel_pause_count, 2), coalesce(late_cancel_window_days, 90)
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
    and expert_late_cancel
    and cancelled_at > now() - make_interval(days => v_days);

  if v_count >= v_limit then
    update public.expert_profiles
    set paused = true,
        palam_paused_at = now(),
        palam_pause_reason = 'late_cancellations'
    where profile_id = new.expert_profile_id
      and palam_paused_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists auto_pause_after_late_cancel on public.bookings;
create trigger auto_pause_after_late_cancel
  after update on public.bookings
  for each row
  when (new.expert_late_cancel and not old.expert_late_cancel)
  execute function public.pause_after_late_cancellations();

revoke execute on function public.pause_after_late_cancellations() from public, anon, authenticated;

-- To lift a pause (the owner, from the SQL editor):
--   update public.expert_profiles
--   set paused = false, palam_paused_at = null, palam_pause_reason = null
--   where profile_id = '<expert id>';
