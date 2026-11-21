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

// Text message reminders — decided 2026-11-15 to hold until after launch.
// The sending code and the private phone storage exist; this hides the option
// in the app so nobody opts in to texts that cannot be sent yet. Flip to true
// once the Twilio secrets are set and the number is registered with carriers.
export const SMS_REMINDERS_ENABLED = false;

// Customer booking — ON since 2026-11-21: the owner decided to launch
// customers and experts together instead of building up experts first (the
// 2026-10-20 supply-first plan). When false it hides the Book session bar on
// expert profiles and blocks the /book/[id] route ("Booking opens soon").
// The Supabase secret CUSTOMER_BOOKING_ENABLED must match, so the welcome
// email uses the right wording.
export const CUSTOMER_BOOKING_ENABLED = true;
