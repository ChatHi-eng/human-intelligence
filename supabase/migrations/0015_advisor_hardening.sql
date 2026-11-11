-- 0015_advisor_hardening
-- Post-deploy sweep from Supabase's security advisor (run 2026-11-11, after
-- 0014): pin search_path on the trigger/util functions it flagged, and stop
-- the API roles from invoking internal functions over /rest/v1/rpc.
-- Paste into the Supabase SQL editor and Run. Safe to re-run.

-- Pin search_path so a malicious schema earlier in a caller's search_path
-- can't shadow the tables these functions touch.
alter function public.touch_updated_at() set search_path = public;
alter function public.reviews_after_change() set search_path = public;
alter function public.messages_after_insert() set search_path = public;
alter function public.protect_expert_profiles_columns() set search_path = public;
alter function public.protect_bookings_columns() set search_path = public;
alter function public.protect_profiles_columns() set search_path = public;
alter function public.protect_conversations_columns() set search_path = public;

-- Internal functions should not be callable via the public RPC endpoint.
-- handle_new_user / rls_auto_enable only ever run as triggers (and trigger
-- functions can't be invoked over RPC anyway) — revoking just silences the
-- advisor and removes a footgun.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- recompute_expert_rating: the reviews_after_change trigger runs AS THE
-- SIGNED-IN USER and calls this function, so 'authenticated' MUST keep
-- EXECUTE — revoking it would break posting reviews. Only anon is revoked.
-- (An authenticated user calling it over RPC merely recomputes the true
-- aggregates from the reviews table — harmless by construction.)
revoke execute on function public.recompute_expert_rating(uuid) from anon;
