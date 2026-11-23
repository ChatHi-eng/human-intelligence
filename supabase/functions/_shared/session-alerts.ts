// Messages about a session that is happening or has just happened:
//
//   "X is waiting for you"   one person is in the call, the other is not
//   "How was your session?"  asks the customer for a review afterwards
//
// Shared by join-call (which knows the moment someone opens the call) and
// send-reminders (which checks every couple of minutes). Each message is
// claimed in booking_reminders before it goes, so it is only ever sent once.

import { joinKey, joinPath, type JoinRole } from './join.ts';
import { APP_URL, clockTime, pushToUsers } from './notify.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

const DEFAULT_SENDER = 'Palam <onboarding@resend.dev>';
const SUPPORT_EMAIL = 'info@palamapp.com';
const BRAND_GREEN = '#0F6E56';

export type AlertEnv = {
  resendKey: string | undefined;
  // Signs the personal join links.
  serviceKey: string;
  from?: string;
  defaultTz?: string;
  twilio?: { sid: string; token: string; from: string } | null;
};

export type AlertBooking = {
  id: string;
  customer_id: string;
  expert_profile_id: string;
  start_at: string;
  end_at: string;
  kind: string | null;
};

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const emailShell = (body: string, footer = '') =>
  [
    '<div style="background:#ffffff;padding:32px 16px;">',
    `<div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">`,
    `<p style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:${BRAND_GREEN};">palam</p>`,
    '<p style="margin:2px 0 28px;font-size:13px;color:#6b7280;">Talk to a human who knows.</p>',
    body,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 14px;">',
    `<p style="margin:0;font-size:12px;color:#9ca3af;">Palam &middot; Questions? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#9ca3af;">${SUPPORT_EMAIL}</a>.${footer ? ` ${footer}` : ''}</p>`,
    '</div>',
    '</div>',
  ].join('\n');

export const para = (text: string) => `<p style="margin:0 0 16px;">${text}</p>`;

// A button, with the address spelled out underneath for mail apps that strip
// buttons.
export const emailButton = (label: string, url: string) =>
  [
    `<p style="margin:0 0 8px;"><a href="${url}" style="display:inline-block;background:${BRAND_GREEN};color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:12px;">${label}</a></p>`,
    `<p style="margin:0 0 16px;font-size:12px;color:#9ca3af;word-break:break-all;">Or open ${url}</p>`,
  ].join('\n');

const sendEmail = async (env: AlertEnv, to: string, subject: string, html: string) => {
  if (!env.resendKey) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.from ?? DEFAULT_SENDER, to, subject, html }),
    });
    if (!res.ok) console.error('Resend error', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('Resend request failed', err);
    return false;
  }
};

const sendSms = async (env: AlertEnv, to: string, body: string) => {
  if (!env.twilio) return false;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.twilio.sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${env.twilio.sid}:${env.twilio.token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: env.twilio.from, Body: body }),
      },
    );
    if (!res.ok) console.error('Twilio error', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('Twilio request failed', err);
    return false;
  }
};

// True when this call is the one that gets to send `kind` for the booking.
const claim = async (admin: Admin, bookingId: string, kind: string): Promise<boolean> => {
  const { data, error } = await admin
    .from('booking_reminders')
    .upsert({ booking_id: bookingId, kind }, { onConflict: 'booking_id,kind', ignoreDuplicates: true })
    .select('booking_id');
  if (error) {
    console.error('claim failed', bookingId, kind, error.message);
    return false;
  }
  return Boolean(data && data.length > 0);
};

type Person = {
  name: string;
  email: string | null;
  emailReminders: boolean;
  smsPhone: string | null;
  tz: string;
  tzKnown: boolean;
};

const loadPeople = async (admin: Admin, env: AlertEnv, booking: AlertBooking) => {
  const ids = [booking.customer_id, booking.expert_profile_id];
  const [profiles, prefs, expert] = await Promise.all([
    admin.from('profiles').select('id, display_name').in('id', ids),
    admin
      .from('notification_prefs')
      .select('user_id, email_reminders, sms_reminders, phone, timezone')
      .in('user_id', ids),
    admin
      .from('expert_profiles')
      .select('timezone')
      .eq('profile_id', booking.expert_profile_id)
      .maybeSingle(),
  ]);
  const build = async (id: string, fallback: string, expertZone: string | null): Promise<Person> => {
    // deno-lint-ignore no-explicit-any
    const pref = (prefs.data ?? []).find((r: any) => r.user_id === id);
    const zone: string | null = pref?.timezone ?? expertZone;
    const { data: userData } = await admin.auth.admin.getUserById(id);
    return {
      // deno-lint-ignore no-explicit-any
      name: (profiles.data ?? []).find((r: any) => r.id === id)?.display_name ?? fallback,
      email: userData?.user?.email ?? null,
      emailReminders: pref?.email_reminders !== false,
      smsPhone: pref?.sms_reminders && pref?.phone ? pref.phone : null,
      tz: zone ?? env.defaultTz ?? 'UTC',
      tzKnown: zone !== null,
    };
  };
  return {
    customer: await build(booking.customer_id, 'your customer', null),
    expert: await build(
      booking.expert_profile_id,
      'your expert',
      (expert.data?.timezone as string | null) ?? null,
    ),
  };
};

// One person is in the call and `missing` is not: tell the one who is missing,
// on every channel, with their own link straight into the call. Sent once per
// booking. Returns whether this call sent it.
export const sendWaitingAlert = async (
  admin: Admin,
  env: AlertEnv,
  booking: AlertBooking,
  missing: JoinRole,
): Promise<boolean> => {
  if (!(await claim(admin, booking.id, 'other_waiting'))) return false;
  const people = await loadPeople(admin, env, booking);
  const them = missing === 'customer' ? people.customer : people.expert;
  const waiter = missing === 'customer' ? people.expert : people.customer;
  const missingId = missing === 'customer' ? booking.customer_id : booking.expert_profile_id;
  const what = booking.kind === 'intro' ? 'intro call' : 'session';
  const path = joinPath(booking.id, await joinKey(env.serviceKey, booking.id, missing));
  const url = `${APP_URL}${path}`;
  const started = clockTime(booking.start_at, them.tz, them.tzKnown);

  await pushToUsers(admin, [
    {
      userId: missingId,
      message: {
        title: `${waiter.name} is waiting for you`,
        body: `Your ${what} started at ${started}. Tap to join.`,
        path,
        tag: `booking-${booking.id}`,
        ttlSeconds: 15 * 60,
      },
    },
  ]);

  if (them.email) {
    await sendEmail(
      env,
      them.email,
      `${waiter.name} is waiting in your ${what}`,
      emailShell(
        [
          para(`Hi ${escapeHtml(them.name)},`),
          para(
            `${escapeHtml(waiter.name)} is in the call and waiting for you. Your ${what} started at ${started}.`,
          ),
          emailButton('Join the call', url),
          para('Palam'),
        ].join('\n'),
      ),
    );
  }

  if (them.smsPhone) {
    await sendSms(
      env,
      them.smsPhone,
      `Palam: ${waiter.name} is waiting in your ${what}. Join now: ${url} Reply STOP to opt out.`,
    );
  }
  return true;
};

// After a session both people joined: ask the customer how it went. Sent once
// per booking, and never when a review is already in.
export const sendReviewPrompt = async (
  admin: Admin,
  env: AlertEnv,
  booking: AlertBooking,
): Promise<boolean> => {
  // Claimed first, so each finished session is looked at exactly once.
  if (!(await claim(admin, booking.id, 'review_prompt'))) return false;
  const { data: review } = await admin
    .from('reviews')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle();
  if (review) return false;

  const people = await loadPeople(admin, env, booking);
  const what = booking.kind === 'intro' ? 'intro call' : 'session';
  const path = `/booking/${booking.id}?review=1`;

  await pushToUsers(admin, [
    {
      userId: booking.customer_id,
      message: {
        title: `How was your ${what} with ${people.expert.name}?`,
        body: 'Leave a quick review. It helps the next person choose.',
        path,
        tag: `booking-${booking.id}`,
        ttlSeconds: 24 * 60 * 60,
      },
    },
  ]);

  if (people.customer.email && people.customer.emailReminders) {
    await sendEmail(
      env,
      people.customer.email,
      `How was your ${what} with ${people.expert.name}?`,
      emailShell(
        [
          para(`Hi ${escapeHtml(people.customer.name)},`),
          para(
            `Thanks for talking with ${escapeHtml(people.expert.name)}. Would you leave a review? Pick a star rating and add a line or two if you like. It takes under a minute, and it helps the next person choose.`,
          ),
          emailButton('Leave a review', `${APP_URL}${path}`),
          para('Thanks,<br>Palam'),
        ].join('\n'),
        'You can turn these emails off in the app under You, Edit account.',
      ),
    );
  }
  return true;
};
