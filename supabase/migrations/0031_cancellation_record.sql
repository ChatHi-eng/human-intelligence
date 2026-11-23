-- 0031_cancellation_record
-- Who cancelled a booking and when, and whether an expert cancelled a
-- confirmed session with less than 24 hours to go. The app warns an expert
-- that a late cancellation goes on their record; this is that record.
-- Safe to re-run.

alter table public.bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists expert_late_cancel boolean not null default false;

alter table public.bookings
  drop constraint if exists bookings_cancelled_by_check;
alter table public.bookings
  add constraint bookings_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('customer', 'expert', 'palam'));

-- Filled in by the database at the moment a booking becomes cancelled, from
-- what it can see for itself (who is signed in, what the booking was, how far
-- off the start is). The app cannot write these columns.
create or replace function public.record_cancellation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_by text;
begin
  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    v_by := case
      -- The customer cancels straight from the app, as themselves.
      when auth.uid() is not null and auth.uid() = old.customer_id then 'customer'
      -- An expert's decline or cancellation goes through respond-to-booking,
      -- which writes this exact reason.
      when new.cancellation_reason = 'declined by expert' then 'expert'
      -- Expired requests, abandoned checkouts, anything done by Palam.
      else 'palam'
    end;
    new.cancelled_at := now();
    new.cancelled_by := v_by;
    new.expert_late_cancel :=
      v_by = 'expert'
      and old.status = 'confirmed'
      and old.start_at - now() < interval '24 hours';
  elsif current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.cancelled_at := null;
      new.cancelled_by := null;
      new.expert_late_cancel := false;
    else
      new.cancelled_at := old.cancelled_at;
      new.cancelled_by := old.cancelled_by;
      new.expert_late_cancel := old.expert_late_cancel;
    end if;
  end if;
  return new;
end;
$$;

-- Named to run after the other "before" triggers on bookings, so it sees the
-- status they settle on.
drop trigger if exists zz_record_cancellation on public.bookings;
create trigger zz_record_cancellation
  before insert or update on public.bookings
  for each row
  execute function public.record_cancellation();

revoke execute on function public.record_cancellation() from public, anon, authenticated;

-- An expert's late cancellations are counted over the last 90 days.
create index if not exists bookings_expert_late_cancel_idx
  on public.bookings (expert_profile_id, cancelled_at)
  where expert_late_cancel;
