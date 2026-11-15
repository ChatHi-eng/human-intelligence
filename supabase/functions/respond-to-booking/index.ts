// Supabase Edge Function, respond-to-booking
//
// The expert's answer to a booking, done on the server so the money always
// follows the decision:
//
//   accept   (approve-first requests only) charge the held card, then confirm
//   decline  release the hold, or refund if already charged, then cancel
//
// "decline" also covers an expert cancelling a confirmed session: the
// customer is always refunded in full.
//
// Deploy with "Verify JWT" OFF; the caller is checked here.
// Secrets: STRIPE_SECRET_KEY (plus the auto-provided Supabase keys).

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

type RequestBody = {
  bookingId: string;
  action: 'accept' | 'decline';
  declineReason?: 'time' | 'not_a_fit' | 'other';
};

const DECLINE_REASONS = ['time', 'not_a_fit', 'other'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!stripeKey || !supabaseUrl || !anonKey || !serviceKey) {
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
  if (!body.bookingId || (body.action !== 'accept' && body.action !== 'decline')) {
    return json({ error: 'bookingId and action are required' }, 400);
  }
  if (body.declineReason && !DECLINE_REASONS.includes(body.declineReason)) {
    return json({ error: 'Unknown decline reason' }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Not signed in' }, 401);

  // Read with the caller's own rights: row-level security already limits
  // this to bookings they are part of.
  const { data: booking, error: bookingError } = await userClient
    .from('bookings')
    .select('id, expert_profile_id, status, payment_status, booking_mode, stripe_payment_intent_id')
    .eq('id', body.bookingId)
    .maybeSingle();
  if (bookingError) return json({ error: bookingError.message }, 500);
  if (!booking) return json({ error: 'Booking not found' }, 404);
  if (booking.expert_profile_id !== user.id) {
    return json({ error: 'Only the expert on this booking can do that' }, 403);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
  // Status and payment columns are server-owned (migrations 0014 and 0022).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === 'accept') {
    if (booking.status !== 'requested') {
      return json({ error: 'This request is no longer waiting for an answer' }, 409);
    }
    if (booking.payment_status === 'authorized' && booking.stripe_payment_intent_id) {
      try {
        // Takes the money that was on hold. Throws if the hold has lapsed.
        await stripe.paymentIntents.capture(booking.stripe_payment_intent_id);
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown error';
        return json({ error: `The card hold could not be charged: ${detail}` }, 402);
      }
    } else if (
      booking.payment_status !== 'captured' &&
      // A free intro call has no payment to wait for.
      booking.payment_status !== 'not_required'
    ) {
      return json({ error: 'The customer has not completed payment yet' }, 409);
    }
    const { error } = await admin
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_status: booking.payment_status === 'not_required' ? 'not_required' : 'captured',
      })
      .eq('id', booking.id)
      .eq('status', 'requested');
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, status: 'confirmed' });
  }

  // decline
  if (booking.status !== 'requested' && booking.status !== 'confirmed') {
    return json({ error: 'This booking can no longer be declined' }, 409);
  }
  let paymentStatus = booking.payment_status as string;
  if (booking.stripe_payment_intent_id) {
    try {
      if (booking.payment_status === 'authorized') {
        // Nothing was charged; this lets the hold go.
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        paymentStatus = 'released';
      } else if (booking.payment_status === 'captured') {
        await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          reason: 'requested_by_customer',
          metadata: { booking_id: booking.id, cancellation_reason: 'declined by expert' },
        });
        paymentStatus = 'refunded';
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      return json({ error: `Could not return the customer's money: ${detail}` }, 502);
    }
  }
  const { error } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      // lifecycle-emails matches this exact text to email the customer.
      cancellation_reason: 'declined by expert',
      decline_reason: body.declineReason ?? null,
      payment_status: paymentStatus,
    })
    .eq('id', booking.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, status: 'cancelled', paymentStatus });
});
