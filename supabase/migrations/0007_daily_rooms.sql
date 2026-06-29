-- 0007_daily_rooms
-- Track the Daily room name + expiration so we can later sweep up expired rooms
-- and re-issue per-participant tokens. call_room_url already exists from 0001.

alter table public.bookings
  add column if not exists daily_room_name text,
  add column if not exists daily_room_expires_at timestamptz;

create index if not exists bookings_daily_room_idx
  on public.bookings(daily_room_name)
  where daily_room_name is not null;
