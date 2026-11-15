// Supabase Edge Function, expire-requests
//
// Called every ten minutes by a pg_cron job. Keeps booking requests from
// hanging open:
//
//   1. Approve-first requests the expert never answered. The card was only
//      held, so the hold is released and the request is cancelled when
//      24 hours have passed since the request, or the session is less than
//      12 hours away, whichever comes first. The cancellation email to both
//      people is sent by lifecycle-emails off the row change.
//   2. Halfway through that window, one nudge email to the expert.
//   3. Bookings whose checkout was abandoned: after 45 minutes the time slot
//      is freed (Stripe's own expiry webhook normally does this at 31).
//
// Secrets: STRIPE_SECRET_KEY, RESEND_API_KEY, WEBHOOK_SECRET (same values the
// other functions use). Optional: PALAM_SENDER.
// Deploy with "Verify JWT" OFF; the cron job sends x-webhook-secret.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';

const HOUR = 60 * 60_000;
// Keep these two in step with the copy in the app and the emails.
const RESPONSE_WINDOW_MS = 24 * HOUR;
const CLOSE_BEFORE_START_MS = 12 * HOUR;
const ABANDONED_CHECKOUT_MS = 45 * 60_000;
// lifecycle-emails matches this exact text to email both people.
const EXPIRED_REASON = 'expired: no response from expert';

const DEFAULT_SENDER = 'Palam <onboarding@resend.dev>';
const BRAND_GREEN = '#0F6E56';

type Row = {
  id: string;
  customer_id: string;
  expert_profile_id: string;
  start_at: string;
  created_at: string;
  requested_at: string | null;
  payment_status: string;
  stripe_payment_intent_id: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// When an approve-first request closes if nobody answers.
const deadlineMs = (row: Row) =>
  Math.min(
    Date.parse(row.requested_at ?? row.created_at) + RESPONSE_WINDOW_MS,
    Date.parse(row.start_at) - CLOSE_BEFORE_START_MS,
  );

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!stripeKey || !resendKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ error: 'Missing server config' }, 500);
  }
  if (req.headers.get('x-webhook-secret') !== webhookSecret) {
    return json({ error: 'Forbidden' }, 401);
  }
  const from = Deno.env.get('PALAM_SENDER') ?? DEFAULT_SENDER;

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from('bookings')
    .select(
      'id, customer_id, expert_profile_id, start_at, created_at, requested_at, payment_status, stripe_payment_intent_id',
    )
    .eq('status', 'requested');
  if (error) {
    console.error('bookings lookup failed', error.message);
    return json({ error: 'Lookup failed' }, 500);
  }

  const now = Date.now();
  const result = { expired: 0, nudged: 0, abandoned: 0 };

  for (const row of (data ?? []) as Row[]) {
    // 3. Never paid: free the slot.
    if (row.payment_status === 'pending' || row.payment_status === 'failed') {
      if (now - Date.parse(row.created_at) >= ABANDONED_CHECKOUT_MS) {
        await admin
          .from('bookings')
          .update({
            status: 'cancelled',
            cancellation_reason: 'checkout session expired',
            payment_status: 'failed',
          })
          .eq('id', row.id)
          .eq('status', 'requested');
        result.abandoned += 1;
      }
      continue;
    }
    if (row.payment_status !== 'authorized') continue;

    const deadline = deadlineMs(row);

    // 1. Out of time: let the hold go and close the request.
    if (now >= deadline) {
      if (row.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(row.stripe_payment_intent_id);
        } catch (err) {
          // Already cancelled or lapsed on Stripe's side is fine; anything
          // else is logged and the request is still closed for the customer.
          console.error('hold release failed', row.id, err);
        }
      }
      await admin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancellation_reason: EXPIRED_REASON,
          payment_status: 'released',
        })
        .eq('id', row.id)
        .eq('status', 'requested');
      result.expired += 1;
      continue;
    }

    // 2. Halfway there: one nudge to the expert.
    const requestedMs = Date.parse(row.requested_at ?? row.created_at);
    if (now < requestedMs + (deadline - requestedMs) / 2) continue;
    const { data: claimed } = await admin
      .from('booking_reminders')
      .upsert(
        { booking_id: row.id, kind: 'respond_nudge' },
        { onConflict: 'booking_id,kind', ignoreDuplicates: true },
      )
      .select('booking_id');
    if (!claimed || claimed.length === 0) continue;

    const [{ data: userData }, { data: profiles }] = await Promise.all([
      admin.auth.admin.getUserById(row.expert_profile_id),
      admin.from('profiles').select('id, display_name').in('id', [row.customer_id, row.expert_profile_id]),
    ]);
    const email = userData?.user?.email;
    if (!email) continue;
    const nameOf = (id: string, fallback: string) =>
      (profiles ?? []).find((p) => p.id === id)?.display_name ?? fallback;
    const hoursLeft = Math.max(1, Math.round((deadline - now) / HOUR));
    const html = [
      '<div style="background:#ffffff;padding:32px 16px;">',
      `<div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">`,
      `<p style="margin:0 0 28px;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${BRAND_GREEN};">palam</p>`,
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(nameOf(row.expert_profile_id, 'there'))},</p>`,
      `<p style="margin:0 0 16px;">${escapeHtml(nameOf(row.customer_id, 'A customer'))} is still waiting for your answer to a session request. It closes in about ${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'}, and they are not charged unless you accept.</p>`,
      '<p style="margin:0 0 16px;">Open Palam and go to <strong>Studio</strong>, then <strong>Requests</strong>, to accept or decline.</p>',
      '<p style="margin:0;">Thanks,<br>Palam</p>',
      '</div></div>',
    ].join('\n');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: email, subject: 'A session request is waiting for you', html }),
      });
      if (res.ok) result.nudged += 1;
      else console.error('Resend error', res.status, await res.text());
    } catch (err) {
      console.error('Resend request failed', err);
    }
  }

  return json({ ok: true, ...result });
});
