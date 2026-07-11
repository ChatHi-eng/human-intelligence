// Supabase Edge Function — sync-connect-status
//
// Actively pulls the current state of the auth'd expert's Stripe Connect
// account and mirrors charges_enabled + payouts_enabled onto their
// expert_profiles row. Useful right after onboarding (before Stripe's
// account.updated webhook lands) and as a manual 'Refresh status' action.
//
// Deploy via Supabase dashboard. Toggle "Verify JWT" OFF.
//
// Secrets required:
//   STRIPE_SECRET_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

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

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!stripeKey || !supabaseUrl || !anonKey) {
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

  const { data: expert, error: expertError } = await userClient
    .from('expert_profiles')
    .select('profile_id, stripe_connect_account_id, stripe_connect_payouts_enabled')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (expertError) return json({ error: expertError.message }, 500);
  if (!expert) return json({ error: 'Expert profile not found' }, 404);
  if (!expert.stripe_connect_account_id) {
    return json({
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      accountId: null,
      status: 'not-started',
    });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const account = await stripe.accounts.retrieve(expert.stripe_connect_account_id);

  const payoutsEnabled = Boolean(account.charges_enabled && account.payouts_enabled);
  await userClient
    .from('expert_profiles')
    .update({ stripe_connect_payouts_enabled: payoutsEnabled })
    .eq('profile_id', user.id);

  const missing = account.requirements?.currently_due ?? [];
  const status = payoutsEnabled
    ? 'ready'
    : account.details_submitted
      ? missing.length > 0
        ? 'action-required'
        : 'pending-verification'
      : 'onboarding-incomplete';

  return json({
    accountId: account.id,
    payoutsEnabled,
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    missingRequirements: missing,
    status,
  });
});
