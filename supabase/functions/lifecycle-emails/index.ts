// Supabase Edge Function, lifecycle-emails
//
// Palam's transactional-email layer. Receives Supabase Database Webhook POSTs
// (triggers created by migration 0013) for two tables and turns each row
// transition into exactly one email per recipient:
//
//   profiles INSERT
//     → new user: "Welcome to Palam"
//   bookings INSERT (status 'requested')
//     → expert:   "New booking request" (time, format, price, their cut)
//     → customer: "Request sent. You'll hear back soon"
//   bookings UPDATE, status requested → confirmed
//     → customer: "You're booked" (time + join instructions)
//     → expert:   short confirmation (session lands in their Today list)
//   bookings UPDATE, status → cancelled
//     → the OTHER party, copy branching on cancellation_reason
//       ('declined by expert' → customer; anything else → expert)
//   bookings UPDATE, payment_status → refunded
//     → customer: "Your refund is through", skipped when the same event is a
//       decline, because the decline email already says "refunded in full"
//   bookings UPDATE, no_show_reported_by set (null → value)
//     → owner alert (APPLICATION_ALERT_EMAIL) + a short acknowledgment to the
//       party who reported. The no_show_reported_* columns land in a separate
//       no-show-policy migration; until they exist this simply never fires.
//
// Idempotency: every UPDATE email is derived by comparing old_record to
// record, so webhook retries and no-op updates never double-send.
//
// Emails go out through the Resend API. The request is authenticated by a
// shared secret header (x-webhook-secret) that the migration-0013 triggers
// send, not by a JWT.
//
// Secrets required (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY    , re_... (Resend → API Keys); same key as notify-application
//   WEBHOOK_SECRET    , same value as notify-application / migration 0010/0013
//   SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase)
// Optional:
//   PALAM_SENDER      , from-address override, e.g. "Palam <hello@palamapp.com>".
//                        Set it once palamapp.com is verified in Resend; until
//                        then the test sender below can only deliver to the
//                        Resend account owner's address (other sends fail, are
//                        logged, and we still return 200, nothing retries).
//   PALAM_TIMEZONE    , IANA zone for times in emails (default UTC). The app
//                        always shows the reader's local time.
//   APPLICATION_ALERT_EMAIL, where owner alerts (no-show reports) go; same
//                        secret notify-application uses (default
//                        vkinatukara@gmail.com).
//   PLATFORM_FEE_PCT  , same secret create-checkout-session reads (default 0.15);
//                        used here only to show the expert their cut.
//   CUSTOMER_BOOKING_ENABLED, set to "true" when customer booking opens. Until
//                        then the welcome email recruits experts and says
//                        booking is not open yet.
//
// Deploy via the Supabase dashboard: Edge Functions → New Function → paste this.
// IMPORTANT: when creating the function in the dashboard, toggle OFF "Verify JWT".
// The database trigger doesn't send a Supabase auth header; the request is
// authenticated by x-webhook-secret instead.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ---------------------------------------------------------------------------
// Sender, the single place the from-address lives. Until palamapp.com is
// verified in Resend, this test sender only delivers to the account owner.
// After verification, set the PALAM_SENDER secret (wins without a redeploy)
// or change this constant and redeploy.
// ---------------------------------------------------------------------------
const DEFAULT_SENDER = 'Palam <onboarding@resend.dev>';
const SUPPORT_EMAIL = 'info@palamapp.com';
// Where links in emails point (the web app; it opens the mobile app's pages).
const APP_URL = 'https://app.palamapp.com';
const BRAND_GREEN = '#0F6E56';

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type BookingRow = {
  id: string;
  customer_id: string;
  expert_profile_id: string;
  start_at: string;
  end_at: string;
  medium: string;
  status: string;
  payment_status: string;
  price_cents: number;
  cancellation_reason: string | null;
  // What the customer wants to talk about (migration 0018). Optional so the
  // function works on rows written before the column existed.
  customer_note?: string | null;
  // Why the expert declined, if they said (migration 0020): 'time',
  // 'not_a_fit' or 'other'.
  decline_reason?: string | null;
  // 'instant' (paid and confirmed at once) or 'approval' (card held until the
  // expert accepts). Migration 0022.
  booking_mode?: string | null;
  // 'session' (paid, 30 minutes) or 'intro' (free, 15 minutes). Migration 0023.
  kind?: string | null;
  // Added by the separate no-show-policy migration. Optional on purpose: this
  // function must work whether or not that migration has run yet.
  no_show_reported_by?: string | null;
  no_show_reported_at?: string | null;
};

// Shape of the payload supabase_functions.http_request POSTs for row events.
type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: ProfileRow | BookingRow | null;
  old_record: ProfileRow | BookingRow | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// User-written values (display names) go into email HTML.
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Resend failures are non-fatal by design: log and move on, so the response is
// always a quick 200 and the webhook never retries forever over a bad send.
const sendEmail = async (
  resendKey: string,
  payload: { from: string; to: string; subject: string; html: string },
) => {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('Resend error', res.status, await res.text());
    }
  } catch (err) {
    console.error('Resend request failed', err);
  }
};

// ---------------------------------------------------------------------------
// Tiny shared template: wordmark header, body copy, muted footer. Minimal
// HTML on purpose, plain and readable beats clever in a transactional inbox.
// ---------------------------------------------------------------------------
const emailHtml = (body: string) =>
  [
    '<div style="background:#ffffff;padding:32px 16px;">',
    `<div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">`,
    `<p style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${BRAND_GREEN};">palam</p>`,
    '<p style="margin:2px 0 28px;font-size:13px;color:#6b7280;">Talk to a human who knows.</p>',
    body,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 14px;">',
    `<p style="margin:0;font-size:12px;color:#9ca3af;">Palam &middot; Questions? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#9ca3af;">${SUPPORT_EMAIL}</a></p>`,
    '</div>',
    '</div>',
  ].join('\n');

const p = (text: string) => `<p style="margin:0 0 16px;">${text}</p>`;

const note = (text: string) => `<p style="margin:-8px 0 16px;font-size:13px;color:#6b7280;">${text}</p>`;

const details = (rows: [string, string][]) =>
  [
    '<table style="margin:0 0 16px;border-collapse:collapse;">',
    ...rows.map(
      ([label, value]) =>
        `<tr><td style="padding:3px 16px 3px 0;color:#6b7280;font-size:14px;vertical-align:top;">${label}</td><td style="padding:3px 0;font-size:14px;">${value}</td></tr>`,
    ),
    '</table>',
  ].join('\n');

const signoff = (line: string) => `<p style="margin:0;">${line}<br>Palam</p>`;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const mediumLabel = (medium: string) => (medium === 'phone' ? 'Phone call' : 'Video call');

// Emails can't know the reader's timezone, so times are formatted in
// PALAM_TIMEZONE (default UTC) with the zone named; the app shows local time.
const formatWhen = (startIso: string, endIso: string, tz: string) => {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(start);
    const time = (d: Date) =>
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
    return `${day}, ${time(start)} to ${time(end)} (${tz})`;
  } catch {
    // A bad PALAM_TIMEZONE value must never block a send.
    return `${escapeHtml(startIso)} to ${escapeHtml(endIso)} (UTC)`;
  }
};

const TIMES_NOTE = 'The Palam app shows this session in your own timezone.';

// What the expert keeps after Palam's cut. Mirrors create-checkout-session:
// PLATFORM_FEE_PCT secret, clamped so a typo'd value can't nonsense the email.
const feePct = () => {
  const raw = Number(Deno.env.get('PLATFORM_FEE_PCT') ?? '0.15');
  return Number.isFinite(raw) && raw >= 0 && raw <= 0.5 ? raw : 0.15;
};
const expertCutCents = (priceCents: number) => Math.floor(priceCents * (1 - feePct()));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!resendKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ error: 'Missing server config' }, 500);
  }
  const from = Deno.env.get('PALAM_SENDER') ?? DEFAULT_SENDER;
  const tz = Deno.env.get('PALAM_TIMEZONE') ?? 'UTC';
  const alertEmail = Deno.env.get('APPLICATION_ALERT_EMAIL') ?? 'vkinatukara@gmail.com';

  // The migration-0013 triggers send this header; nothing else knows the value.
  if (req.headers.get('x-webhook-secret') !== webhookSecret) {
    return json({ error: 'Forbidden' }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!payload.record) {
    return json({ ok: true, skipped: true });
  }

  // Service-role client: auth.users isn't readable any other way, and no user
  // is signed in for webhook traffic.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Emails live in auth.users; display names live in profiles. Lookups are
  // best-effort, a missing name degrades to friendly copy, a missing email
  // skips that recipient (logged), and the webhook still gets its 200.
  const emailOf = async (userId: string): Promise<string | null> => {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) console.error('auth.users lookup failed', userId, error.message);
    return data?.user?.email ?? null;
  };
  const namesOf = async (ids: string[]): Promise<Map<string, string>> => {
    const { data, error } = await admin.from('profiles').select('id, display_name').in('id', ids);
    if (error) console.error('profiles lookup failed', error.message);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.display_name) map.set(row.id, escapeHtml(row.display_name));
    }
    return map;
  };

  // -------------------------------------------------------------------------
  // profiles INSERT → welcome email
  // -------------------------------------------------------------------------
  if (payload.table === 'profiles') {
    if (payload.type !== 'INSERT') {
      return json({ ok: true, skipped: true });
    }
    const profile = payload.record as ProfileRow;
    const email = await emailOf(profile.id);
    if (!email) {
      console.error('welcome email skipped, no address for', profile.id);
      return json({ ok: true, skipped: true });
    }
    const name = profile.display_name ? escapeHtml(profile.display_name) : 'there';
    // Supply-first launch: until the CUSTOMER_BOOKING_ENABLED secret is 'true'
    // the welcome email recruits experts and does not promise booking.
    const bookingOpen = Deno.env.get('CUSTOMER_BOOKING_ENABLED') === 'true';

    await sendEmail(resendKey, {
      from,
      to: email,
      subject: 'Welcome to Palam',
      html: emailHtml(
        [
          p(`Hi ${name},`),
          p(
            "Welcome to Palam. Search engines now answer with AI text compiled from other people's work. Here you talk to a person who has lived the problem you're stuck on. We vet every expert ourselves.",
          ),
          ...(bookingOpen
            ? [
                p(
                  'Sessions are 30 minutes, one-on-one, over video. You pick a person, pick a time, and have a straight conversation.',
                ),
                p(
                  "Have a look around the app and see who's here. If you're the one people come to for advice, you can apply to become a Palam expert in the app.",
                ),
              ]
            : [
                p(
                  "We're signing up experts first, so you can't book a session yet. You can still look around the app and see who's here.",
                ),
                p(
                  `If you're the one people come to for advice, apply to become an expert in the app. It takes about four minutes and a person reads every application.`,
                ),
              ]),
          signoff("Glad you're here,"),
        ].join('\n'),
      ),
    });
    return json({ ok: true });
  }

  // -------------------------------------------------------------------------
  // bookings INSERT / UPDATE
  // -------------------------------------------------------------------------
  if (payload.table !== 'bookings') {
    return json({ ok: true, skipped: true });
  }

  const booking = payload.record as BookingRow;
  const old = payload.old_record as BookingRow | null;

  const names = await namesOf([booking.customer_id, booking.expert_profile_id]);
  const customerName = names.get(booking.customer_id) ?? 'A Palam customer';
  const expertName = names.get(booking.expert_profile_id) ?? 'your expert';
  const when = formatWhen(booking.start_at, booking.end_at, tz);
  const format = mediumLabel(booking.medium);
  const price = money(booking.price_cents);
  const cut = money(expertCutCents(booking.price_cents));
  const pct = Math.round(feePct() * 100);

  const instant = booking.booking_mode === 'instant';
  const freeIntro = booking.kind === 'intro';
  // A paid booking is not news when its row appears: the customer has not
  // paid yet, so its emails come from the UPDATEs that follow. A free intro
  // has no payment step, so its row appearing IS the event.
  const introInsert = payload.type === 'INSERT' && freeIntro;
  if (!introInsert && (payload.type !== 'UPDATE' || !old)) {
    return json({ ok: true, skipped: true });
  }
  const what = freeIntro ? 'free 15-minute intro call' : 'session';

  // ---- A request an approve-first expert has to answer → tell both sides ----
  const becameRequest = introInsert
    ? booking.status === 'requested'
    : old !== null &&
      old.payment_status !== 'authorized' &&
      booking.payment_status === 'authorized' &&
      booking.status === 'requested';
  if (becameRequest) {

    const [expertEmail, customerEmail] = await Promise.all([
      emailOf(booking.expert_profile_id),
      emailOf(booking.customer_id),
    ]);

    if (expertEmail) {
      await sendEmail(resendKey, {
        from,
        to: expertEmail,
        subject: `New booking request from ${customerName}`,
        html: emailHtml(
          [
            p(`Hi ${expertName},`),
            p(
              `${customerName} just asked to book a ${what} with you. It's waiting in <strong>Studio &rarr; Requests</strong>. Accept it if the time works, decline if it doesn't. You have 24 hours to answer; after that the request closes on its own.`,
            ),
            details(
              freeIntro
                ? [
                    ['When', when],
                    ['Format', format],
                  ]
                : [
                    ['When', when],
                    ['Format', format],
                    ['Price', price],
                    ['You earn', `${cut} (after Palam's ${pct}% fee)`],
                  ],
            ),
            note(TIMES_NOTE),
            ...(booking.customer_note
              ? [
                  p(
                    `<strong>What they want to talk about:</strong><br>${escapeHtml(booking.customer_note)}`,
                  ),
                ]
              : []),
            ...(freeIntro
              ? []
              : [
                  p(
                    `${customerName}'s card is on hold and is only charged when you accept. If you decline, they pay nothing.`,
                  ),
                ]),
            signoff('Thanks for being here,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('request email skipped, no address for expert', booking.expert_profile_id);
    }

    if (customerEmail) {
      await sendEmail(resendKey, {
        from,
        to: customerEmail,
        subject: "Request sent. You'll hear back soon",
        html: emailHtml(
          [
            p(`Hi ${customerName},`),
            p(
              `Your request is in. ${expertName} has been asked to confirm, and you'll get an email from us the moment they answer.`,
            ),
            details([
              ['Expert', expertName],
              ['When', when],
              ['Format', format],
              ['Price', freeIntro ? 'Free' : price],
            ]),
            note(TIMES_NOTE),
            p(
              freeIntro
                ? `${expertName} has 24 hours to answer. This intro call is free, so there is nothing to pay.`
                : `About your payment: your card has a hold for ${price}, and nothing has been charged. You are charged only if ${expertName} accepts. If they decline, or do not answer within 24 hours, the hold is released and you pay nothing.`,
            ),
            signoff('Talk soon,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('request email skipped, no address for customer', booking.customer_id);
    }

    return json({ ok: true });
  }

  // An instant free intro is born confirmed; everything else gets there by
  // an UPDATE from 'requested'.
  const becameConfirmed = introInsert
    ? booking.status === 'confirmed'
    : old !== null && old.status === 'requested' && booking.status === 'confirmed';
  const becameCancelled =
    old !== null && old.status !== 'cancelled' && booking.status === 'cancelled';
  const becameRefunded =
    old !== null && old.payment_status !== 'refunded' && booking.payment_status === 'refunded';
  const noShowReported =
    old !== null &&
    (old.no_show_reported_by ?? null) === null &&
    Boolean(booking.no_show_reported_by);
  const declinedByExpert = booking.cancellation_reason === 'declined by expert';
  // Palam's cancellation policy: free until 24h before the start; inside 24h
  // a customer cancellation isn't refunded (expert cancellations always are).
  // The email fires at cancellation time, so "now" is the cancellation moment.
  const cancelledInside24h =
    new Date(booking.start_at).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  if (!becameConfirmed && !becameCancelled && !becameRefunded && !noShowReported) {
    return json({ ok: true, skipped: true });
  }

  // ---- requested → confirmed: both sides hear it's on ----------------------
  if (becameConfirmed) {
    const [customerEmail, expertEmail] = await Promise.all([
      emailOf(booking.customer_id),
      emailOf(booking.expert_profile_id),
    ]);

    if (customerEmail) {
      await sendEmail(resendKey, {
        from,
        to: customerEmail,
        subject: instant ? `You're booked with ${expertName}` : `You're booked: ${expertName} confirmed`,
        html: emailHtml(
          [
            p(`Hi ${customerName},`),
            p(
              freeIntro
                ? instant
                  ? `Your free 15-minute intro call with ${expertName} is booked.`
                  : `${expertName} said yes. Your free 15-minute intro call is booked.`
                : instant
                  ? `You're booked with ${expertName}, and your card has been charged ${price}.`
                  : `${expertName} said yes. You're booked, and your card has now been charged ${price}.`,
            ),
            details([
              ['Expert', expertName],
              ['When', when],
              ['Format', format],
            ]),
            note(TIMES_NOTE),
            p(
              'To join, open Palam a few minutes before the start, open this booking, and tap <strong>Join</strong>. The call runs inside the app, so there is nothing to install.',
            ),
            p(
              freeIntro
                ? 'One tip: fifteen minutes is short. Use it to say what you need and see whether this is the right person, then book a full session if it is.'
                : 'One tip: thirty minutes goes faster than you think. Come with your question sharp and the backstory trimmed, and you&rsquo;ll get twice as much out of it.',
            ),
            signoff('Talk soon,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('confirmation email skipped, no address for customer', booking.customer_id);
    }

    if (expertEmail) {
      await sendEmail(resendKey, {
        from,
        to: expertEmail,
        subject: instant
          ? `New session booked: ${customerName}`
          : `Locked in: session with ${customerName}`,
        html: emailHtml(
          [
            p(`Hi ${expertName},`),
            p(
              freeIntro && instant
                ? `${customerName} booked a free 15-minute intro call with you. It'll be in your <strong>Today</strong> list in Studio when the day comes. If you can't make it, cancel from the booking.`
                : instant
                ? `${customerName} booked a session with you and has paid. It'll be in your <strong>Today</strong> list in Studio when the day comes. If you can't make it, cancel from the booking and they are refunded in full.`
                : `You accepted. Your session with ${customerName} is locked in. It'll be waiting in your <strong>Today</strong> list in Studio when the day comes.`,
            ),
            details(
              freeIntro
                ? [
                    ['When', when],
                    ['Format', format],
                  ]
                : [
                    ['When', when],
                    ['Format', format],
                    ['You earn', `${cut} (after Palam's ${pct}% fee)`],
                  ],
            ),
            note(TIMES_NOTE),
            ...(instant && booking.customer_note
              ? [
                  p(
                    `<strong>What they want to talk about:</strong><br>${escapeHtml(booking.customer_note)}`,
                  ),
                ]
              : []),
            signoff('Thanks for being here,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('confirmation email skipped, no address for expert', booking.expert_profile_id);
    }
  }

  // ---- → cancelled: tell the party who didn't do the cancelling ------------
  if (becameCancelled && declinedByExpert) {
    const customerEmail = await emailOf(booking.customer_id);
    if (customerEmail) {
      // If the same update already flipped the payment to refunded, say so
      // plainly; otherwise promise the refund that the app kicks off.
      const refundLine = freeIntro
        ? 'The intro call was free, so there is nothing to refund.'
        : booking.payment_status === 'released'
          ? 'Your card was not charged. The hold on it has been released and will drop off your statement within a few days.'
          : booking.payment_status === 'refunded'
            ? 'Your card was refunded in full. Depending on your bank, it can take 5 to 10 business days to show on your statement.'
            : 'Your card will be refunded in full. If it was already charged, the refund is on its way.';
      await sendEmail(resendKey, {
        from,
        to: customerEmail,
        subject: `${expertName} couldn't make your session`,
        html: emailHtml(
          [
            p(`Hi ${customerName},`),
            p(
              booking.decline_reason === 'time'
                ? `${expertName} could not do the time you picked.`
                : booking.decline_reason === 'not_a_fit'
                  ? `${expertName} read your request and felt it was outside what they can help with.`
                  : `${expertName} declined your session request. It happens. Schedules are messy and good people are busy.`,
            ),
            details([
              ['When', when],
              ['Format', format],
            ]),
            p(refundLine),
            p(
              booking.decline_reason === 'time'
                ? `<a href="${APP_URL}/expert/${booking.expert_profile_id}" style="color:${BRAND_GREEN};font-weight:700;">See ${expertName}'s other open times</a>`
                : "There are more people on Palam who know this ground. When you're ready, have another look around.",
            ),
            signoff('Talk soon,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('decline email skipped, no address for customer', booking.customer_id);
    }
  }

  // The expert did not answer an approve-first request in time (set by the
  // expire-requests function). The customer was never charged.
  const expired = booking.cancellation_reason === 'expired: no response from expert';
  // An abandoned checkout was never announced to anyone, so freeing its time
  // slot is silent.
  const abandoned = booking.cancellation_reason === 'checkout session expired';

  if (becameCancelled && expired) {
    const customerEmail = await emailOf(booking.customer_id);
    if (customerEmail) {
      await sendEmail(resendKey, {
        from,
        to: customerEmail,
        subject: `Your request to ${expertName} has closed`,
        html: emailHtml(
          [
            p(`Hi ${customerName},`),
            p(
              freeIntro
                ? `${expertName} did not answer your intro call request in time, so it has closed.`
                : `${expertName} did not answer your session request in time, so it has closed. Your card was not charged, and the hold on it has been released.`,
            ),
            details([
              ['When', when],
              ['Format', format],
            ]),
            p(
              `<a href="${APP_URL}" style="color:${BRAND_GREEN};font-weight:700;">Find another expert on Palam</a>`,
            ),
            signoff('Sorry about that,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('expiry email skipped, no address for customer', booking.customer_id);
    }
  }

  if (becameCancelled && !declinedByExpert && !abandoned) {
    const expertEmail = await emailOf(booking.expert_profile_id);
    if (expertEmail) {
      const refundNote = freeIntro
        ? ''
        : booking.payment_status === 'refunded'
          ? 'Their payment was refunded in full.'
          : booking.payment_status === 'released'
            ? 'They had not been charged.'
            : cancelledInside24h
              ? "Per Palam's cancellation policy, cancellations within 24 hours of the session aren't refunded, so your payout is unchanged."
              : 'Their payment is being refunded.';
      const why = expired
        ? `The request from ${customerName} below closed because it was not answered within 24 hours.${freeIntro ? '' : ' They were not charged.'}`
        : booking.cancellation_reason === 'cancelled by customer'
          ? `${customerName} cancelled the session below. ${refundNote} That time is open again, and there is nothing you need to do.`
          : 'The session below was cancelled. Nothing to do on your side.';
      await sendEmail(resendKey, {
        from,
        to: expertEmail,
        subject: expired
          ? `Request closed: ${customerName}`
          : `Cancelled: session with ${customerName}`,
        html: emailHtml(
          [
            p(`Hi ${expertName},`),
            p(why),
            details([
              ['When', when],
              ['Format', format],
            ]),
            signoff('Thanks for being here,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('cancellation email skipped, no address for expert', booking.expert_profile_id);
    }
  }

  // ---- payment_status → refunded: confirm the money came back --------------
  // Skipped when this same event is an expert decline: that email already
  // says "refunded in full", and two emails for one moment reads as a glitch.
  if (becameRefunded && !(becameCancelled && declinedByExpert)) {
    const customerEmail = await emailOf(booking.customer_id);
    if (customerEmail) {
      await sendEmail(resendKey, {
        from,
        to: customerEmail,
        subject: 'Your refund is through',
        html: emailHtml(
          [
            p(`Hi ${customerName},`),
            p(
              `The refund for your session with ${expertName} went through: ${price} back on your card, in full.`,
            ),
            p('Depending on your bank, it can take 5 to 10 business days to show on your statement.'),
            signoff('Talk soon,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('refund email skipped, no address for customer', booking.customer_id);
    }
  }

  // ---- no-show reported: alert the owner, acknowledge the reporter ---------
  if (noShowReported && booking.no_show_reported_by) {
    const reporterId = booking.no_show_reported_by;
    const reporterIsCustomer = reporterId === booking.customer_id;

    await sendEmail(resendKey, {
      from,
      to: alertEmail,
      subject: `No-show reported: booking ${booking.id}`,
      html: emailHtml(
        [
          p('A no-show was just reported.'),
          details([
            ['Booking', escapeHtml(booking.id)],
            ['When', when],
            ['Reported by', reporterIsCustomer ? `Customer (${customerName})` : `Expert (${expertName})`],
            ['Price', price],
          ]),
          p(
            'Policy: for a customer no-show, the expert keeps the payout. For an expert no-show, full refund plus a strike. Resolve with the refund tool.',
          ),
        ].join('\n'),
      ),
    });

    const reporterEmail = await emailOf(reporterId);
    if (reporterEmail) {
      await sendEmail(resendKey, {
        from,
        to: reporterEmail,
        subject: 'We got your no-show report',
        html: emailHtml(
          [
            p(`Hi ${reporterIsCustomer ? customerName : expertName},`),
            p(
              "We got your report. A human reviews every one within 48 hours, and you'll hear from us as soon as it's resolved. Nothing more to do on your side.",
            ),
            details([
              ['When', when],
              ['Format', format],
            ]),
            signoff('Thanks for flagging it,'),
          ].join('\n'),
        ),
      });
    } else {
      console.error('no-show ack skipped, no address for reporter', reporterId);
    }
  }

  return json({ ok: true });
});
