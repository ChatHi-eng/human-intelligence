-- Human Intelligence — initial schema
-- Paste this whole file into the Supabase SQL editor and click Run.
-- Safe to re-run: every CREATE uses IF NOT EXISTS, every policy uses CREATE OR REPLACE.

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- ============================================================================
-- TABLES
-- ============================================================================

-- profiles: one row per authenticated user. Created automatically by a trigger
-- on auth.users insert (see "TRIGGERS" section below).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- expert_profiles: only exists for users who opt in to offer expertise.
-- Having a row here means "this profile can appear on the Discover screen".
create table if not exists public.expert_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  industry_id text not null,
  headline text not null,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  years_experience integer not null default 0 check (years_experience >= 0),
  verified boolean not null default false,
  cover_image_url text,
  -- Denormalized aggregates updated by review triggers (faster than computing per query).
  rating_average numeric(3,2) not null default 0 check (rating_average >= 0 and rating_average <= 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles(profile_id) on delete cascade,
  title text not null,
  issuer text not null,
  year smallint not null check (year between 1900 and 2100),
  created_at timestamptz not null default now()
);

-- Weekly recurring availability windows. weekday: 0=Sun..6=Sat.
-- Minutes since midnight in local time (we'll handle TZ on the client).
create table if not exists public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles(profile_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  expert_profile_id uuid not null references public.expert_profiles(profile_id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  medium text not null check (medium in ('video', 'phone')),
  status text not null default 'confirmed' check (
    status in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled')
  ),
  payment_status text not null default 'pending' check (
    payment_status in ('pending', 'authorized', 'captured', 'refunded', 'failed')
  ),
  price_cents integer not null check (price_cents >= 0),
  call_room_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One review per booking. enforced by unique(booking_id).
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  expert_profile_id uuid not null references public.expert_profiles(profile_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index if not exists expert_profiles_industry_idx
  on public.expert_profiles(industry_id);

create index if not exists expert_profiles_rating_idx
  on public.expert_profiles(rating_average desc);

create index if not exists bookings_customer_idx
  on public.bookings(customer_id, start_at desc);

create index if not exists bookings_expert_idx
  on public.bookings(expert_profile_id, start_at desc);

create index if not exists reviews_expert_idx
  on public.reviews(expert_profile_id, created_at desc);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create a profiles row when a new auth.users row is inserted.
-- Display name defaults to the part before @ in the email — user can edit later.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(new.email, '@', 1),
      'You'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Auto-update updated_at on row update.
create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists expert_profiles_touch_updated_at on public.expert_profiles;
create trigger expert_profiles_touch_updated_at
before update on public.expert_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
before update on public.bookings
for each row execute function public.touch_updated_at();

-- Keep expert rating_average / rating_count in sync with reviews.
create or replace function public.recompute_expert_rating(p_expert uuid)
returns void language plpgsql
as $$
begin
  update public.expert_profiles
  set
    rating_average = coalesce(
      (select round(avg(rating)::numeric, 2) from public.reviews where expert_profile_id = p_expert),
      0
    ),
    rating_count = (select count(*) from public.reviews where expert_profile_id = p_expert)
  where profile_id = p_expert;
end;
$$;

create or replace function public.reviews_after_change()
returns trigger language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_expert_rating(old.expert_profile_id);
    return old;
  else
    perform public.recompute_expert_rating(new.expert_profile_id);
    return new;
  end if;
end;
$$;

drop trigger if exists reviews_after_change on public.reviews;
create trigger reviews_after_change
after insert or update or delete on public.reviews
for each row execute function public.reviews_after_change();

-- ============================================================================
-- ROW-LEVEL SECURITY
-- All tables: deny by default, then explicit policies.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.expert_profiles enable row level security;
alter table public.credentials enable row level security;
alter table public.availability_windows enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;

-- ---------- profiles ----------
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- INSERT is handled by the trigger using security definer — no client INSERT policy needed.
-- DELETE: not allowed from the client.

-- ---------- expert_profiles ----------
drop policy if exists "expert_profiles_select_all" on public.expert_profiles;
create policy "expert_profiles_select_all" on public.expert_profiles
  for select to authenticated using (true);

drop policy if exists "expert_profiles_insert_own" on public.expert_profiles;
create policy "expert_profiles_insert_own" on public.expert_profiles
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists "expert_profiles_update_own" on public.expert_profiles;
create policy "expert_profiles_update_own" on public.expert_profiles
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "expert_profiles_delete_own" on public.expert_profiles;
create policy "expert_profiles_delete_own" on public.expert_profiles
  for delete to authenticated using (profile_id = auth.uid());

-- ---------- credentials ----------
drop policy if exists "credentials_select_all" on public.credentials;
create policy "credentials_select_all" on public.credentials
  for select to authenticated using (true);

drop policy if exists "credentials_write_own" on public.credentials;
create policy "credentials_write_own" on public.credentials
  for all to authenticated
  using (expert_profile_id = auth.uid())
  with check (expert_profile_id = auth.uid());

-- ---------- availability_windows ----------
drop policy if exists "availability_select_all" on public.availability_windows;
create policy "availability_select_all" on public.availability_windows
  for select to authenticated using (true);

drop policy if exists "availability_write_own" on public.availability_windows;
create policy "availability_write_own" on public.availability_windows
  for all to authenticated
  using (expert_profile_id = auth.uid())
  with check (expert_profile_id = auth.uid());

-- ---------- bookings ----------
drop policy if exists "bookings_select_party" on public.bookings;
create policy "bookings_select_party" on public.bookings
  for select to authenticated
  using (customer_id = auth.uid() or expert_profile_id = auth.uid());

drop policy if exists "bookings_insert_self" on public.bookings;
create policy "bookings_insert_self" on public.bookings
  for insert to authenticated
  with check (customer_id = auth.uid());

-- Both sides can update bookings they're a party to (status changes, payment status, etc.).
-- Tighter per-column rules can come later if needed.
drop policy if exists "bookings_update_party" on public.bookings;
create policy "bookings_update_party" on public.bookings
  for update to authenticated
  using (customer_id = auth.uid() or expert_profile_id = auth.uid())
  with check (customer_id = auth.uid() or expert_profile_id = auth.uid());

-- DELETE: not allowed (use cancelled status instead, preserves audit trail).

-- ---------- reviews ----------
drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews
  for select to authenticated using (true);

-- The customer who booked is the only one who can write the review, and only
-- for a booking they own. The booking-ownership check happens via FK + this policy.
drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
        and b.status = 'completed'
    )
  );

drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews
  for update to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews
  for delete to authenticated
  using (customer_id = auth.uid());
