// Supabase Edge Function — refund-booking
//
// Refund a booking's payment. Auth'd user must be either the customer or the
// expert party to the booking. Calls stripe.refunds.create on the booking's
// payment_intent. Sets payment_status='refunded' synchronously; the webhook
// will also confirm via charge.refunded.
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

type RequestBody = { bookingId: string; reason?: string };

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

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!body.bookingId) return json({ error: 'bookingId required' }, 400);

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
    .select('id, customer_id, expert_profile_id, payment_status, stripe_payment_intent_id')
    .eq('id', body.bookingId)
    .maybeSingle();
  if (bookingError) return json({ error: bookingError.message }, 500);
  if (!booking) return json({ error: 'Booking not found' }, 404);
  if (booking.customer_id !== user.id && booking.expert_profile_id !== user.id) {
    return json({ error: 'Forbidden' }, 403);
  }
  if (!booking.stripe_payment_intent_id) {
    return json({ error: 'No payment to refund' }, 409);
  }
  if (booking.payment_status === 'refunded') {
    return json({ error: 'Already refunded' }, 409);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const refund = await stripe.refunds.create({
    payment_intent: booking.stripe_payment_intent_id,
    reason: 'requested_by_customer',
    metadata: {
      booking_id: booking.id,
      cancellation_reason: body.reason ?? '',
    },
  });

  await userClient
    .from('bookings')
    .update({ payment_status: 'refunded' })
    .eq('id', booking.id);

  return json({ refundId: refund.id, status: refund.status });
});
