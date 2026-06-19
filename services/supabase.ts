// Stub Supabase client. Real credentials get wired via EXPO_PUBLIC_SUPABASE_URL /
// EXPO_PUBLIC_SUPABASE_ANON_KEY in a follow-up session. The UI must always go through
// this module — no `@supabase/supabase-js` imports anywhere else.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!url || !anonKey) return null;
  if (!cached) {
    cached = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return cached;
};

export const supabaseConfigured = () => Boolean(url && anonKey);
