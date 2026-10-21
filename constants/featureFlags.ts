// Feature flags — single place to turn app surfaces on/off.
// Messaging is built and works end-to-end but is intentionally disabled for
// launch; flip to true to bring back the Messages tab, chat screens, and
// Message buttons. (Migration 0008_messaging.sql must be applied in Supabase
// before enabling.)
export const MESSAGING_ENABLED = false;

// Phone sessions — decided 2026-10-20 to launch video-only: the phone medium
// was bookable but no call mechanism exists yet. Hides the Phone option at
// booking and drops "or phone" from marketing copy. Existing phone bookings
// still render. Flip to true once a real dialer/Twilio flow ships.
export const PHONE_SESSIONS_ENABLED = false;

// Customer booking — decided 2026-10-20 to launch supply-first: experts join
// and get vetted before customers can pay. Hides the Book session bar on
// expert profiles, blocks the /book/[id] route ("Booking opens soon"), and
// switches the welcome screen to expert-recruitment copy. Discover stays
// visible as a roster. Flip to true to open the doors to customers.
export const CUSTOMER_BOOKING_ENABLED = false;
