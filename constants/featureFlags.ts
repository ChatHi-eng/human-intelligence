// Feature flags — single place to turn app surfaces on/off.
// Messaging is built and works end-to-end but is intentionally disabled for
// launch; flip to true to bring back the Messages tab, chat screens, and
// Message buttons. (Migration 0008_messaging.sql must be applied in Supabase
// before enabling.)
export const MESSAGING_ENABLED = false;
