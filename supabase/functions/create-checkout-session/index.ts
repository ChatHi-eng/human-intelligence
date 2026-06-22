// Supabase Edge Function — create-checkout-session
//
// Called from the mobile app after a booking row is inserted. Validates that
// the calling user owns the booking (RLS-style check), builds a Stripe Checkout
// Session for the booking amount, writes the session_id back, and returns the
// session URL for the client to open.
//
// Secrets required (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY  — sk_test_...
//   APP_DEEP_LINK_RETURN_BASE — e.g. http://localhost:8081 (or your production host)
//
// Deploy via the Supabase dashboard: Edge Functions → New Function → paste this.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

type RequestBody = { bookingId: string };

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const returnBase = Deno.env.get('APP_DEEP_LINK_RETURN_BASE') ?? 'http://localhost:8081';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!stripeKey || !supabaseUrl || !anonKey) {
    return json({ error: 'Missing server config' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!body.bookingId) return json({ error: 'bookingId required' }, 400);

  // User-scoped client — respects RLS, so the user can only see their own booking.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Not signed in' }, 401);

  const { data: booking, error: bookingError } = await userClient
    .from('bookings')
    .select('id, customer_id, expert_profile_id, price_cents, status, payment_status, stripe_checkout_session_id')
    .eq('id', body.bookingId)
    .maybeSingle();
  if (bookingError) return json({ error: bookingError.message }, 500);
  if (!booking) return json({ error: 'Booking not found' }, 404);
  if (booking.customer_id !== user.id) return json({ error: 'Forbidden' }, 403);
  if (booking.payment_status === 'captured') {
    return json({ error: 'Already paid' }, 409);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: user.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: booking.price_cents,
          product_data: {
            name: 'Human Intelligence session',
            description: `Booking ${booking.id}`,
          },
        },
      },
    ],
    metadata: {
      booking_id: booking.id,
      customer_id: booking.customer_id,
      expert_profile_id: booking.expert_profile_id,
    },
    success_url: `${returnBase}/booking/${booking.id}?stripe=success`,
    cancel_url: `${returnBase}/booking/${booking.id}?stripe=cancel`,
  });

  // Persist the session id so the webhook can correlate events back to this booking.
  await userClient
    .from('bookings')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', booking.id);

  return json({ sessionId: session.id, sessionUrl: session.url });
});
