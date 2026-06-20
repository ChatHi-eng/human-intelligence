-- 0004_booking_workflow
-- Bookings now start as 'requested' until the expert accepts.
-- Paste into Supabase SQL editor and Run. Safe to re-run.

-- Default new bookings to 'requested' (was 'confirmed').
alter table public.bookings
  alter column status set default 'requested';

-- Track why a booking was cancelled / declined.
alter table public.bookings
  add column if not exists cancellation_reason text;
