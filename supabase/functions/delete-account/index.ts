// Supabase Edge Function — delete-account
//
// Permanently deletes the signed-in user's account. Auth'd via the caller's
// Authorization header (user-scoped client → auth.getUser()), then the user is
// removed with the service-role admin API. The schema cascades from auth.users:
// profiles → expert_profiles → credentials, availability, bookings, reviews,
// conversations, messages all go with it.
//
// Refuses while the user has a live booking on either side (requested /
// confirmed / in_progress) — they cancel those first. If the user is an expert
// with a Stripe Connect account, deletion still goes ahead but Stripe is
// deliberately NOT touched: the Connect account belongs to the expert, and the
// only thing that disappears is our row linking it to Palam.
//
// Deploy via Supabase dashboard. Toggle "Verify JWT" OFF.
//
// Secrets required: none — SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Missing server config' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // A live booking means someone else is counting on this account — as the
  // customer or as the expert. Make them cancel first so nobody gets ghosted.
  const { data: activeBookings, error: bookingsError } = await admin
    .from('bookings')
    .select('id')
    .or(`customer_id.eq.${user.id},expert_profile_id.eq.${user.id}`)
    .in('status', ['requested', 'confirmed', 'in_progress'])
    .limit(1);
  if (bookingsError) return json({ error: bookingsError.message }, 500);
  if (activeBookings && activeBookings.length > 0) {
    return json(
      { error: 'You still have an upcoming or active booking. Cancel it first, then try again.' },
      409,
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({ deleted: true });
});
