-- 0018_scheduling_fixes
-- Fixes found in the Nov 2026 user-story audit. Safe to re-run.

-- 1. Expert time zone. Availability windows are stored as minutes since
-- midnight in the EXPERT's local time; until now nothing recorded which zone
-- that was, so a customer elsewhere saw the hours shifted. IANA name, e.g.
-- "America/New_York". Null means "not set yet" (the app falls back to the
-- viewer's zone, which is the old behaviour).
alter table public.expert_profiles
  add column if not exists timezone text;

-- 2. Days off. A row with blocked = true closes that whole date, overriding
-- the weekly hours. Rows with blocked = false keep adding extra hours.
alter table public.availability_dates
  add column if not exists blocked boolean not null default false;

-- 3. What the customer wants to talk about, written when they book and shown
-- to the expert with the request.
alter table public.bookings
  add column if not exists customer_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_customer_note_length'
  ) then
    alter table public.bookings
      add constraint bookings_customer_note_length
      check (customer_note is null or char_length(customer_note) <= 600);
  end if;
end $$;

-- 4. No double booking. Row-level security hides other customers' bookings,
-- so the app could not see that a slot was taken and two people could pay for
-- the same time. This trigger refuses a new booking that overlaps an active
-- one for the same expert. The advisory lock serialises inserts per expert so
-- two simultaneous requests cannot both pass the check.
create or replace function public.prevent_double_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.expert_profile_id::text));
  if exists (
    select 1 from public.bookings b
    where b.expert_profile_id = new.expert_profile_id
      and b.status in ('requested', 'confirmed', 'in_progress')
      and b.start_at < new.end_at
      and b.end_at > new.start_at
  ) then
    raise exception 'That time was just taken. Please pick another.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_double_booking on public.bookings;
create trigger prevent_double_booking
before insert on public.bookings
for each row execute function public.prevent_double_booking();

-- 5. Busy times. Lets a signed-in customer see WHEN an expert is taken (start
-- and end only, nothing about who booked) so taken slots are not offered.
create or replace function public.expert_busy_times(p_expert_id uuid)
returns table (start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select b.start_at, b.end_at
  from public.bookings b
  where b.expert_profile_id = p_expert_id
    and b.status in ('requested', 'confirmed', 'in_progress')
    and b.end_at > now();
$$;

revoke all on function public.expert_busy_times(uuid) from public, anon;
grant execute on function public.expert_busy_times(uuid) to authenticated;
