// Supabase Edge Function, send-reminders
//
// Called every ten minutes by a pg_cron job (see README "Reminders"). Finds
// confirmed sessions that are coming up and reminds BOTH people, on every
// channel they have switched on:
//
//   day_before   sent once, between 28 and 24 hours before the start
//   hour_before  sent once, between 60 and 5 minutes before the start
//
//   email  on by default (notification_prefs.email_reminders)
//   push   to every device token the person has registered (push_tokens)
//   text   only when they opted in and gave a number, and only when the
//          TWILIO_* secrets below are set
//
// Idempotent: a row in booking_reminders is claimed before anything is sent,
// so a retry or an overlapping run can never send the same reminder twice.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY, WEBHOOK_SECRET   same values the other email functions use
//   SUPABASE_SERVICE_ROLE_KEY        auto-provided
// Optional:
//   PALAM_SENDER, PALAM_TIMEZONE     as in lifecycle-emails
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
//                                    text reminders stay off until all three exist
//
// Deploy with "Verify JWT" OFF. The cron job authenticates with the
// x-webhook-secret header, not a Supabase login.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DEFAULT_SENDER = 'Palam <onboarding@resend.dev>';
const SUPPORT_EMAIL = 'info@palamapp.com';
const BRAND_GREEN = '#0F6E56';

type Kind = 'day_before' | 'hour_before';

type BookingRow = {
  id: string;
  customer_id: string;
  expert_profile_id: string;
  start_at: string;
  end_at: string;
  medium: string;
  customer_note: string | null;
  kind: string | null;
};

type Prefs = {
  user_id: string;
  email_reminders: boolean;
  sms_reminders: boolean;
  phone: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const emailHtml = (body: string) =>
  [
    '<div style="background:#ffffff;padding:32px 16px;">',
    `<div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">`,
    `<p style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${BRAND_GREEN};">palam</p>`,
    '<p style="margin:2px 0 28px;font-size:13px;color:#6b7280;">Talk to a human who knows.</p>',
    body,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 14px;">',
    `<p style="margin:0;font-size:12px;color:#9ca3af;">Palam &middot; Questions? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#9ca3af;">${SUPPORT_EMAIL}</a>. You can turn reminders off in the app under You, Edit account.</p>`,
    '</div>',
    '</div>',
  ].join('\n');

const p = (text: string) => `<p style="margin:0 0 16px;">${text}</p>`;
const signoff = (line: string) => `<p style="margin:0;">${line}<br>Palam</p>`;

// "Tuesday, Nov 17, 3:00 PM (America/New_York)". Falls back to UTC when the
// zone name is not one this runtime knows.
const formatWhen = (startIso: string, tz: string) => {
  const build = (zone: string) =>
    `${new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(startIso))} (${zone})`;
  try {
    return build(tz);
  } catch {
    return build('UTC');
  }
};

const kindFor = (minutesToStart: number): Kind | null => {
  if (minutesToStart > 24 * 60 && minutesToStart <= 28 * 60) return 'day_before';
  if (minutesToStart >= 5 && minutesToStart <= 60) return 'hour_before';
  return null;
};

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!resendKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ error: 'Missing server config' }, 500);
  }
  if (req.headers.get('x-webhook-secret') !== webhookSecret) {
    return json({ error: 'Forbidden' }, 401);
  }

  const from = Deno.env.get('PALAM_SENDER') ?? DEFAULT_SENDER;
  const defaultTz = Deno.env.get('PALAM_TIMEZONE') ?? 'UTC';
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER');
  const smsReady = Boolean(twilioSid && twilioToken && twilioFrom);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = Date.now();
  const { data: upcoming, error: bookingsError } = await admin
    .from('bookings')
    .select('id, customer_id, expert_profile_id, start_at, end_at, medium, customer_note, kind')
    .eq('status', 'confirmed')
    .gt('start_at', new Date(now).toISOString())
    .lte('start_at', new Date(now + 28 * 60 * 60_000).toISOString());
  if (bookingsError) {
    console.error('bookings lookup failed', bookingsError.message);
    return json({ error: 'Lookup failed' }, 500);
  }

  const sent = { email: 0, push: 0, sms: 0, reminders: 0 };

  const sendEmail = async (to: string, subject: string, html: string) => {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (res.ok) sent.email += 1;
      else console.error('Resend error', res.status, await res.text());
    } catch (err) {
      console.error('Resend request failed', err);
    }
  };

  const sendPush = async (tokens: string[], title: string, body: string, bookingId: string) => {
    if (tokens.length === 0) return;
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          tokens.map((to) => ({ to, title, body, sound: 'default', data: { bookingId } })),
        ),
      });
      if (res.ok) sent.push += tokens.length;
      else console.error('Expo push error', res.status, await res.text());
    } catch (err) {
      console.error('Expo push request failed', err);
    }
  };

  const sendSms = async (to: string, body: string) => {
    if (!smsReady) return;
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: twilioFrom ?? '', Body: body }),
        },
      );
      if (res.ok) sent.sms += 1;
      else console.error('Twilio error', res.status, await res.text());
    } catch (err) {
      console.error('Twilio request failed', err);
    }
  };

  for (const booking of (upcoming ?? []) as BookingRow[]) {
    const minutesToStart = (Date.parse(booking.start_at) - now) / 60_000;
    const minutes = Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000);
    const kind = kindFor(minutesToStart);
    if (!kind) continue;

    // Claim the reminder first. No row back means another run already has it.
    const { data: claimed, error: claimError } = await admin
      .from('booking_reminders')
      .upsert(
        { booking_id: booking.id, kind },
        { onConflict: 'booking_id,kind', ignoreDuplicates: true },
      )
      .select('booking_id');
    if (claimError) {
      console.error('claim failed', booking.id, claimError.message);
      continue;
    }
    if (!claimed || claimed.length === 0) continue;
    sent.reminders += 1;

    const ids = [booking.customer_id, booking.expert_profile_id];
    const [profilesRes, prefsRes, tokensRes, expertRes] = await Promise.all([
      admin.from('profiles').select('id, display_name').in('id', ids),
      admin
        .from('notification_prefs')
        .select('user_id, email_reminders, sms_reminders, phone')
        .in('user_id', ids),
      admin.from('push_tokens').select('user_id, token').in('user_id', ids),
      admin
        .from('expert_profiles')
        .select('timezone')
        .eq('profile_id', booking.expert_profile_id)
        .maybeSingle(),
    ]);
    const nameOf = (id: string, fallback: string) =>
      (profilesRes.data ?? []).find((r) => r.id === id)?.display_name ?? fallback;
    const prefsOf = (id: string): Prefs | undefined =>
      ((prefsRes.data ?? []) as Prefs[]).find((r) => r.user_id === id);
    const tokensOf = (id: string) =>
      (tokensRes.data ?? []).filter((r) => r.user_id === id).map((r) => r.token as string);

    const customerName = nameOf(booking.customer_id, 'your customer');
    const expertName = nameOf(booking.expert_profile_id, 'your expert');
    const expertTz = (expertRes.data?.timezone as string | null) ?? defaultTz;

    const recipients = [
      {
        id: booking.customer_id,
        isExpert: false,
        name: customerName,
        other: expertName,
        // We do not know the customer's zone, so say which one this is.
        when: formatWhen(booking.start_at, defaultTz),
      },
      {
        id: booking.expert_profile_id,
        isExpert: true,
        name: expertName,
        other: customerName,
        when: formatWhen(booking.start_at, expertTz),
      },
    ];

    for (const r of recipients) {
      const prefs = prefsOf(r.id);
      const soon = kind === 'hour_before';
      const subject = soon
        ? `In about an hour: your session with ${r.other}`
        : `Reminder: your session with ${r.other}`;
      const lead = soon
        ? `Your session with ${escapeHtml(r.other)} starts in about an hour.`
        : `Your ${minutes}-minute ${booking.kind === 'intro' ? 'intro call' : 'session'} with ${escapeHtml(r.other)} is coming up.`;

      if (prefs?.email_reminders !== false) {
        const { data: userData } = await admin.auth.admin.getUserById(r.id);
        const email = userData?.user?.email;
        if (email) {
          const lines = [
            p(`Hi ${escapeHtml(r.name)},`),
            p(lead),
            p(`<strong>When:</strong> ${r.when}<br><span style="font-size:13px;color:#6b7280;">The Palam app shows this in your own time zone.</span>`),
          ];
          if (r.isExpert && booking.customer_note) {
            lines.push(
              p(`<strong>What they want to talk about:</strong><br>${escapeHtml(booking.customer_note)}`),
            );
          }
          lines.push(
            p(
              'To join, open Palam a few minutes before the start, open this booking, and tap <strong>Join</strong>.',
            ),
          );
          if (!soon && !r.isExpert) {
            lines.push(
              p('Plans changed? Cancelling is free until 24 hours before the start.'),
            );
          }
          lines.push(signoff('Talk soon,'));
          await sendEmail(email, subject, emailHtml(lines.join('\n')));
        }
      }

      await sendPush(
        tokensOf(r.id),
        soon ? 'Session in about an hour' : 'Session coming up',
        `With ${r.other}. ${r.when}`,
        booking.id,
      );

      if (prefs?.sms_reminders && prefs.phone) {
        await sendSms(
          prefs.phone,
          `Palam: your session with ${r.other} ${soon ? 'starts in about an hour' : `is on ${r.when}`}. Open the app to join. Reply STOP to opt out.`,
        );
      }
    }
  }

  return json({ ok: true, ...sent, smsConfigured: smsReady });
});
