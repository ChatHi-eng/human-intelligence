// Business constants shared across the app.
//
// PLATFORM_FEE_PCT is the cut Palam takes from each booking. The authoritative
// value lives server-side: the create-checkout-session Edge Function reads the
// PLATFORM_FEE_PCT Supabase secret (defaulting to 0.15). This client constant
// only drives the earnings *display* — keep the two in sync when changing the
// fee, or expert earnings snapshots will be slightly off until the next sync.
export const PLATFORM_FEE_PCT = 0.15;

// Slots that start sooner than this are not offered. Booking is
// request-and-accept, so the expert needs time to see the request.
export const MIN_BOOKING_NOTICE_MINUTES = 120;

// A star average is only shown once an expert has this many reviews; an
// average built on one or two ratings tells a customer very little.
export const MIN_REVIEWS_FOR_RATING = 5;

// Choices for the gap an expert keeps free around each booked session.
export const BUFFER_OPTIONS_MINUTES = [0, 15, 30] as const;

// How far ahead customers can book.
export const BOOKING_WINDOW_DAYS = 14;

// Palam's fee as a whole percent, for copy.
export const PLATFORM_FEE_DISPLAY_PCT = Math.round(PLATFORM_FEE_PCT * 100);
