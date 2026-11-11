-- 0012_no_show_reports
-- Cancellation & no-show policy: either participant can report a no-show from
-- the booking screen, from 10 minutes after the scheduled start until 72 hours
-- after. The report is two columns on the booking — who filed it, and when.
-- A human reviews every report by hand; there is no automated attendance
-- tracking at launch.
-- Paste into the Supabase SQL editor and click Run. Safe to re-run.
--
-- Apply BEFORE running an app build with the "Report a no-show" button — the
-- app writes these columns and errors until this runs.

alter table public.bookings
  add column if not exists no_show_reported_by uuid references public.profiles(id);

alter table public.bookings
  add column if not exists no_show_reported_at timestamptz;

-- ============================================================================
-- RLS: no new policy needed.
-- The existing "bookings_update_party" policy (0001_initial_schema.sql)
-- already restricts updates to the booking's own customer or expert — exactly
-- who may file a report. The app writes the report with
-- `where no_show_reported_by is null`, so the first report wins and a second
-- tap changes nothing (one report per booking).
-- ============================================================================

-- ============================================================================
-- Resolving a report (manual flow, launch version):
--   An alert email arrives → Table Editor → bookings → open the row → check
--   no_show_reported_by (join profiles for the name) and payment_status.
--   Expert no-show → refund the payment (Stripe dashboard → Payments →
--   Refund; the charge.refunded webhook flips payment_status) and note a
--   strike against the expert — two strikes in 90 days = removed.
--   Customer no-show → nothing to do; the expert keeps the payout.
-- ============================================================================
