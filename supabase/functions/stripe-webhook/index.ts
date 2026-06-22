// Supabase Edge Function — stripe-webhook
//
// Receives Stripe webhook events. Verifies the signature against
// STRIPE_WEBHOOK_SECRET, then flips booking.payment_status based on event type.
// Uses the service role key so it can update rows regardless of who's signed in
// (no user is signed in for webhook traffic).
//
// Secrets required:
//   STRIPE_SECRET_KEY        — sk_test_...
//   STRIPE_WEBHOOK_SECRET    — whsec_... (from the Stripe webhook endpoint config)
//   SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase as SUPABASE_SERVICE_ROLE_KEY)
//
// Deploy via the Supabase dashboard: Edge Functions → New Function → paste this.
// IMPORTANT: when creating the function in the dashboard, toggle OFF "Verify JWT".
// Stripe doesn't send a Supabase auth header; the request is authenticated by
// the Stripe signature instead.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ error: 'Missing server config' }, 500);
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return json({ error: 'Missing signature' }, 400);

  const rawBody = await req.text();
  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'signature verification failed';
    return json({ error: `Webhook signature invalid: ${msg}` }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Helper: update a booking by either checkout session id or payment intent id.
  const updateBookingBySession = async (sessionId: string, patch: Record<string, unknown>) => {
    await admin
      .from('bookings')
      .update(patch)
      .eq('stripe_checkout_session_id', sessionId);
  };

  const updateBookingByPI = async (piId: string, patch: Record<string, unknown>) => {
    await admin.from('bookings').update(patch).eq('stripe_payment_intent_id', piId);
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : null;
      await updateBookingBySession(session.id, {
        stripe_payment_intent_id: paymentIntentId,
        payment_status: session.payment_status === 'paid' ? 'captured' : 'authorized',
      });
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      await updateBookingBySession(session.id, {
        payment_status: 'failed',
        cancellation_reason: 'checkout session expired',
        status: 'cancelled',
      });
      break;
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      await updateBookingByPI(pi.id, { payment_status: 'captured' });
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      await updateBookingByPI(pi.id, { payment_status: 'failed' });
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (piId) await updateBookingByPI(piId, { payment_status: 'refunded' });
      break;
    }
    case 'account.updated': {
      // Stripe Connect account state changed. Mirror charges_enabled +
      // payouts_enabled onto our expert_profiles row so the app can show the
      // right status and the checkout session knows whether to split payments.
      const account = event.data.object as Stripe.Account;
      const enabled = Boolean(account.charges_enabled && account.payouts_enabled);
      await admin
        .from('expert_profiles')
        .update({ stripe_connect_payouts_enabled: enabled })
        .eq('stripe_connect_account_id', account.id);
      break;
    }
    default:
      // Ignore other events.
      break;
  }

  return json({ received: true });
});
