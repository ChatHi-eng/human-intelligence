-- 0028: a verified mobile number before the first booking.
--
-- A customer proves a mobile number once, with a code sent by text, before
-- their first booking. The number is kept (privately, in notification_prefs)
-- for reminders and for reaching someone who does not show up.
--
-- Three parts:
--
-- 1. app_config: one row of switches the owner controls. The requirement is
--    OFF until a text-message provider is set up, because nobody could pass a
--    check that cannot send its code. Turn it on with:
--      update public.app_config set phone_verification_required = true;
--
-- 2. notification_prefs.phone_verified_at: when the number was proven. Only
--    the verify-phone Edge Function (service role) can set it. A signed-in
--    user changing their number loses the mark and must prove the new one.
--
-- 3. A check on new bookings: while the switch is on, a customer without a
--    verified number is refused by the database, whatever the app shows.

create table if not exists public.app_config (
  id boolean primary key default true check (id),
  phone_verification_required boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (true) on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- Signed-in users may read the switches; nobody but the owner can change them
-- (no insert, update or delete policy).
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config
  for select to authenticated using (true);

alter table public.notification_prefs
  add column if not exists phone_verified_at timestamptz;

create or replace function public.protect_phone_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.phone_verified_at := null;
    elsif new.phone is distinct from old.phone then
      new.phone_verified_at := null;
    else
      new.phone_verified_at := old.phone_verified_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_phone_verification on public.notification_prefs;
create trigger protect_phone_verification
  before insert or update on public.notification_prefs
  for each row
  execute function public.protect_phone_verification();

create or replace function public.require_verified_phone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only bookings made from the app are checked; the owner and the service
  -- role can still create one by hand.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if not coalesce((select phone_verification_required from public.app_config limit 1), false) then
    return new;
  end if;
  if not exists (
    select 1
    from public.notification_prefs
    where user_id = new.customer_id
      and phone is not null
      and phone_verified_at is not null
  ) then
    raise exception 'Verify your mobile number before booking.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists require_verified_phone on public.bookings;
create trigger require_verified_phone
  before insert on public.bookings
  for each row
  execute function public.require_verified_phone();
