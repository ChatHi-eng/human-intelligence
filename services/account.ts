// Account deletion — calls the `delete-account` Edge Function, which verifies
// the caller, refuses while they have a live booking, and otherwise deletes the
// auth user (the schema cascades everything else away).
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export const deleteMyAccount = async (): Promise<void> => {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { error } = await sb.functions.invoke('delete-account', { body: {} });
  if (error) {
    // On a non-2xx the generic invoke error hides the function's message
    // ("cancel your booking first", etc.) — dig it out of the response body.
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
};
