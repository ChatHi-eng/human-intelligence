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

// Experts who approve each request need time to answer, so their times are
// only offered a full day or more ahead. Requests they do not answer close
// after 24 hours, or 12 hours before the session (expire-requests function).
export const APPROVAL_BOOKING_NOTICE_MINUTES = 24 * 60;

// The home screen grows with the catalogue. With one or two experts a
// guided step and themed rows would only repeat the same faces, so each
// piece appears once there are enough people to make it useful.
export const GUIDED_MATCH_MIN_EXPERTS = 3;
export const AVAILABLE_ROW_MIN_EXPERTS = 4;
export const FIELD_ROWS_MIN_EXPERTS = 6;

// Lengths of the two things a customer can book.
export const SESSION_MINUTES = 30;
export const INTRO_MINUTES = 15;

// Choices for how many free intro calls an expert takes in a week.
export const INTRO_WEEKLY_LIMIT_OPTIONS = [3, 5, 10] as const;

// How far ahead customers can book.
export const BOOKING_WINDOW_DAYS = 14;

// Palam's fee as a whole percent, for copy.
export const PLATFORM_FEE_DISPLAY_PCT = Math.round(PLATFORM_FEE_PCT * 100);

// The welcome screen shows a few experts' photos only once there are enough
// people listed for it to look like a marketplace. With one or two it reads
// as odd (owner's call, 2026-11-21), so below this number it shows none.
export const WELCOME_FACES_MIN_EXPERTS = 12;
