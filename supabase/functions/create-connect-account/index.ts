// Supabase Edge Function — create-connect-account
//
// Onboards an expert to Stripe Connect (Express accounts). Creates a Stripe
// Express account if the expert doesn't have one yet, saves the account ID
// to expert_profiles.stripe_connect_account_id, then generates a fresh
// account-link URL for the user to complete onboarding.
//
// Deploy via Supabase dashboard. Toggle "Verify JWT" OFF (we auth inside
// using the Authorization header).
//
// Secrets required:
//   STRIPE_SECRET_KEY
//   APP_DEEP_LINK_RETURN_BASE  (e.g. http://localhost:8081)

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
  const returnBase = Deno.env.get('APP_DEEP_LINK_RETURN_BASE') ?? 'http://localhost:8081';
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
    .select('profile_id, stripe_connect_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (expertError) return json({ error: expertError.message }, 500);
  if (!expert) {
    return json({ error: 'Create your expert profile first' }, 404);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  let accountId = expert.stripe_connect_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { profile_id: user.id },
    });
    accountId = account.id;
    const { error: saveError } = await userClient
      .from('expert_profiles')
      .update({ stripe_connect_account_id: accountId })
      .eq('profile_id', user.id);
    if (saveError) return json({ error: saveError.message }, 500);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${returnBase}/expert-profile-edit?stripe=refresh`,
    return_url: `${returnBase}/expert-profile-edit?stripe=connect-return`,
    type: 'account_onboarding',
  });

  return json({ accountId, onboardingUrl: link.url });
});
