-- 0030_call_join_and_review
-- Personal join links, "the other person is waiting", and a review prompt
-- after the session. Safe to re-run.

-- 1. When each person first opened the call. Written only by the join-call
-- Edge Function, so Palam knows when one person is in and the other is not.
alter table public.bookings
  add column if not exists customer_joined_at timestamptz,
  add column if not exists expert_joined_at timestamptz;

-- The app itself can never set these (a client could otherwise fake a join).
create or replace function public.protect_booking_join_times()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.customer_joined_at := null;
      new.expert_joined_at := null;
    else
      new.customer_joined_at := old.customer_joined_at;
      new.expert_joined_at := old.expert_joined_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_booking_join_times on public.bookings;
create trigger protect_booking_join_times
  before insert or update on public.bookings
  for each row
  execute function public.protect_booking_join_times();

revoke execute on function public.protect_booking_join_times() from public, anon, authenticated;

-- 2. Two more once-only messages: "the other person is waiting" and the
-- review prompt.
alter table public.booking_reminders
  drop constraint if exists booking_reminders_kind_check;
alter table public.booking_reminders
  add constraint booking_reminders_kind_check
  check (kind in (
    'day_before', 'hour_before', 'starting_soon', 'respond_nudge',
    'other_waiting', 'review_prompt'
  ));

-- 3. Check every two minutes instead of every ten, so "starting in ten
-- minutes" and "is waiting for you" arrive when they say they do. The job
-- itself (README, "Notifications and reminders") is unchanged.
do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'palam-send-reminders';
  if v_job is not null then
    perform cron.alter_job(v_job, schedule := '*/2 * * * *');
  end if;
end;
$$;
