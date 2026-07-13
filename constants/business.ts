// Business constants shared across the app.
//
// PLATFORM_FEE_PCT is the cut Palam takes from each booking. The authoritative
// value lives server-side: the create-checkout-session Edge Function reads the
// PLATFORM_FEE_PCT Supabase secret (defaulting to 0.15). This client constant
// only drives the earnings *display* — keep the two in sync when changing the
// fee, or expert earnings snapshots will be slightly off until the next sync.
export const PLATFORM_FEE_PCT = 0.15;
