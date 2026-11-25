// Settling a session from the room's record.
//
//   rollCall        ten minutes after the start: whoever is in the room
//                   while the other is not is told where they stand
//   settleSessions  ten minutes after the scheduled finish: the record is
//                   read, the outcome is written on the booking, an expert
//                   no-show is refunded, and everyone concerned is told
//   previewDecision what settleSessions would decide for one booking, with
//                   nothing written and nobody told
//
// The rules are in ./attendance.ts. Nothing here reads what either person
// says happened. Called from send-reminders, every two minutes.

import {
  decide,
  roleOfPass,
  summarise,
  type AttendanceRules,
  type Decision,
  type Visit,
} from './attendance.ts';
import { roomMeetings, roomNameFor, whoIsInRoom } from './daily.ts';
import { CALL_GRACE_MS, joinKey, joinPath } from './join.ts';
import { APP_URL, clockTime, pushToUsers, shortWhen } from './notify.ts';
import { inspectPayment, refundPayment, type RefundResult } from './refund.ts';
import {
  claim,
  emailButton,
  emailShell,
  escapeHtml,
  loadPeople,
  para,
  sendEmail,
  type AlertEnv,
  type Person,
} from './session-alerts.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

export type SettleEnv = AlertEnv & {
  dailyKey?: string;
  stripeKey?: string;
  // Where the owner's alerts go.
  alertEmail: string;
};

const SUPPORT_EMAIL = 'info@palamapp.com';
// The record is read this long after the scheduled finish: the room has
// shut five minutes earlier, so every "left" report is in.
const SETTLE_AFTER_END_MS = 10 * 60_000;
// The minute-10 notice is only worth sending close to minute 10.
const ROLL_CALL_WINDOW_MS = 6 * 60_000;

type Config = AttendanceRules & {
  strikeCount: number;
  strikeWindowDays: number;
  autoRefund: boolean;
  liveFrom: number;
};

const loadConfig = async (admin: Admin): Promise<Config> => {
  const { data } = await admin
    .from('app_config')
    .select(
      'no_show_grace_minutes, no_show_wait_minutes, session_held_minutes, session_floor_minutes, no_show_strike_count, no_show_strike_window_days, auto_refund_expert_no_show, attendance_live_from',
    )
    .maybeSingle();
  return {
    graceMinutes: data?.no_show_grace_minutes ?? 10,
    waitMinutes: data?.no_show_wait_minutes ?? 5,
    heldMinutes: data?.session_held_minutes ?? 20,
    floorMinutes: data?.session_floor_minutes ?? 5,
    strikeCount: data?.no_show_strike_count ?? 2,
    strikeWindowDays: data?.no_show_strike_window_days ?? 90,
    autoRefund: data?.auto_refund_expert_no_show ?? true,
    // No date means the record is not being used yet.
    liveFrom: data?.attendance_live_from ? Date.parse(data.attendance_live_from) : Number.POSITIVE_INFINITY,
  };
};

type SettleBooking = {
  id: string;
  customer_id: string;
  expert_profile_id: string;
  start_at: string;
  end_at: string;
  kind: string | null;
  status: string;
  payment_status: string;
  price_cents: number | null;
  stripe_payment_intent_id: string | null;
  daily_room_name: string | null;
  daily_room_expires_at: string | null;
  customer_joined_at: string | null;
  expert_joined_at: string | null;
};

const BOOKING_COLUMNS =
  'id, customer_id, expert_profile_id, start_at, end_at, kind, status, payment_status, price_cents, stripe_payment_intent_id, daily_room_name, daily_room_expires_at, customer_joined_at, expert_joined_at';

const loadVisits = async (admin: Admin, bookingId: string): Promise<Visit[]> => {
  const { data } = await admin
    .from('call_sessions')
    .select('role, joined_at, left_at')
    .eq('booking_id', bookingId);
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[])
    .filter((r) => r.joined_at)
    .map((r) => ({
      role: r.role ?? null,
      start: Date.parse(r.joined_at),
      end: r.left_at ? Date.parse(r.left_at) : null,
    }));
};

// Copies Daily's own after-the-fact list into the record, so a report that
// never reached Palam does not go missing. False when Daily could not be
// asked.
const reconcile = async (admin: Admin, env: SettleEnv, booking: SettleBooking): Promise<boolean> => {
  if (!booking.daily_room_name) return true;
  if (!env.dailyKey) return false;
  const visits = await roomMeetings(env.dailyKey, booking.daily_room_name);
  if (visits === null) return false;
  const from = Date.parse(booking.start_at) - 60 * 60_000;
  const to = Date.parse(booking.end_at) + 60 * 60_000;
  for (const v of visits) {
    if (v.joinedAtMs < from || v.joinedAtMs > to) continue;
    const leftAt = v.durationSeconds > 0 ? new Date(v.joinedAtMs + v.durationSeconds * 1000).toISOString() : null;
    const { data: existing } = await admin
      .from('call_sessions')
      .select('session_id, left_at')
      .eq('session_id', v.sessionId)
      .maybeSingle();
    if (!existing) {
      await admin.from('call_sessions').upsert(
        {
          session_id: v.sessionId,
          booking_id: booking.id,
          room: booking.daily_room_name,
          role: roleOfPass(v.pass),
          user_ref: v.pass,
          joined_at: new Date(v.joinedAtMs).toISOString(),
          left_at: leftAt,
          duration_seconds: v.durationSeconds,
          source: 'meetings',
        },
        { onConflict: 'session_id', ignoreDuplicates: true },
      );
    } else if (!existing.left_at && leftAt) {
      // Palam heard them arrive but never heard them leave.
      await admin
        .from('call_sessions')
        .update({ left_at: leftAt, duration_seconds: v.durationSeconds, updated_at: new Date().toISOString() })
        .eq('session_id', v.sessionId)
        .is('left_at', null);
    }
  }
  return true;
};

const decideFor = (
  booking: SettleBooking,
  visits: Visit[],
  config: Config,
  nowMs: number,
  recordOk: boolean,
  closeMs?: number,
): Decision =>
  decide({
    startMs: Date.parse(booking.start_at),
    endMs: Date.parse(booking.end_at),
    closeMs:
      closeMs ??
      (booking.daily_room_expires_at
        ? Date.parse(booking.daily_room_expires_at)
        : Date.parse(booking.end_at) + CALL_GRACE_MS),
    nowMs,
    visits,
    rules: config,
    clicked: {
      customer: Boolean(booking.customer_joined_at),
      expert: Boolean(booking.expert_joined_at),
    },
    recordOk,
  });

const money = (cents: number | null) => {
  const value = (cents ?? 0) / 100;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
};

const whatOf = (booking: SettleBooking) => (booking.kind === 'intro' ? 'intro call' : 'session');
const isPaid = (booking: SettleBooking) =>
  booking.kind !== 'intro' && Boolean(booking.stripe_payment_intent_id) && booking.payment_status === 'captured';

// "3:00 PM to 3:02 PM, 3:07 PM to 3:31 PM", in the reader's own time.
const visitsText = (spans: [number, number][], who: Person) =>
  spans.length === 0
    ? 'not at all'
    : spans
        .map(
          ([s, e]) =>
            `${clockTime(new Date(s).toISOString(), who.tz, true)} to ${clockTime(new Date(e).toISOString(), who.tz, who.tzKnown)}`,
        )
        .join(', ');

// ---- Ten minutes in -------------------------------------------------------

// One person is in the room and the other has not come (or has gone). Each
// is told where things stand. Only sent when leaving right now would already
// settle it; anything less clear waits for the full record.
export const rollCall = async (admin: Admin, env: SettleEnv, nowMs: number): Promise<number> => {
  const config = await loadConfig(admin);
  const graceMs = config.graceMinutes * 60_000;
  const { data: running } = await admin
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('medium', 'video')
    .in('status', ['confirmed', 'in_progress'])
    .is('attendance_decided_at', null)
    .lte('start_at', new Date(nowMs - graceMs).toISOString())
    .gt('start_at', new Date(nowMs - graceMs - ROLL_CALL_WINDOW_MS).toISOString());

  let sent = 0;
  for (const booking of (running ?? []) as SettleBooking[]) {
    if (Date.parse(booking.start_at) < config.liveFrom) continue;
    if (nowMs >= Date.parse(booking.end_at)) continue;
    const visits = await loadVisits(admin, booking.id);
    // Ask the room who is there this minute. Where it answers, a visit Palam
    // never heard the end of is closed off.
    const live = env.dailyKey && booking.daily_room_name
      ? await whoIsInRoom(env.dailyKey, booking.daily_room_name)
      : null;
    const settled = visits.map((v) =>
      v.end === null && v.role && live && !live[v.role] ? { ...v, end: nowMs - 15_000 } : v,
    );
    // And someone the room says is there, whom Palam never heard arrive, is
    // counted from when the room says they came in.
    for (const role of ['customer', 'expert'] as const) {
      const since = live?.since[role];
      if (typeof since !== 'number') continue;
      if (!settled.some((v) => v.role === role && v.end === null)) {
        settled.push({ role, start: since, end: null });
      }
    }
    // As if everyone left this second.
    const now = decideFor(booking, settled, config, nowMs, true, nowMs);
    if (now.outcome !== 'expert_no_show' && now.outcome !== 'customer_no_show') continue;
    if (!(await claim(admin, booking.id, 'roll_call'))) continue;

    const people = await loadPeople(admin, env, booking);
    const what = whatOf(booking);
    const paid = isPaid(booking);
    const minutes = config.graceMinutes;
    const expertLink = `${APP_URL}${joinPath(booking.id, await joinKey(env.serviceKey, booking.id, 'expert'))}`;
    const customerLink = `${APP_URL}${joinPath(booking.id, await joinKey(env.serviceKey, booking.id, 'customer'))}`;
    const bookingPath = `/booking/${booking.id}`;

    if (now.outcome === 'expert_no_show') {
      const leave = paid
        ? `You can leave now and you will get a full refund. Nothing more to do: we check the call's record after the ${what} and send the money back.`
        : `You can leave now. There is nothing to pay for this ${what}.`;
      await pushToUsers(admin, [
        {
          userId: booking.customer_id,
          message: {
            title: `${people.expert.name} has not joined`,
            body: paid
              ? `It is ${minutes} minutes past the start. You can leave and you will be refunded in full.`
              : `It is ${minutes} minutes past the start. You can leave.`,
            path: bookingPath,
            tag: `booking-${booking.id}`,
            ttlSeconds: 20 * 60,
          },
        },
        {
          userId: booking.expert_profile_id,
          message: {
            title: `You are ${minutes} minutes late for ${people.customer.name}`,
            body: `They have been told they can leave. Join now if you still can.`,
            path: joinPath(booking.id, await joinKey(env.serviceKey, booking.id, 'expert')),
            tag: `booking-${booking.id}`,
            ttlSeconds: 20 * 60,
          },
        },
      ]);
      if (people.customer.email) {
        await sendEmail(
          env,
          people.customer.email,
          `${people.expert.name} has not joined your ${what}`,
          emailShell(
            [
              para(`Hi ${escapeHtml(people.customer.name)},`),
              para(
                `It is ${minutes} minutes past the start of your ${what} and ${escapeHtml(people.expert.name)} is not in the call. We are sorry.`,
              ),
              para(leave),
              para(
                `If ${escapeHtml(people.expert.name)} joins and you would like to go ahead anyway, stay on. A ${what} that then goes ahead counts as normal.`,
              ),
              para('Palam'),
            ].join('\n'),
          ),
        );
      }
      if (people.expert.email) {
        await sendEmail(
          env,
          people.expert.email,
          `You are ${minutes} minutes late for ${people.customer.name}`,
          emailShell(
            [
              para(`Hi ${escapeHtml(people.expert.name)},`),
              para(
                `Your ${what} with ${escapeHtml(people.customer.name)} started at ${clockTime(booking.start_at, people.expert.tz, people.expert.tzKnown)} and you are not in the call. ${escapeHtml(people.customer.name)} has been told they can leave${paid ? ' with a full refund' : ''}.`,
              ),
              para(
                `If you can still make it, join now. A ${what} you miss is ${paid ? 'refunded to the customer and ' : ''}recorded as a missed session on your profile.`,
              ),
              emailButton('Join the call', expertLink),
              para('Palam'),
            ].join('\n'),
          ),
        );
      }
    } else {
      await pushToUsers(admin, [
        {
          userId: booking.expert_profile_id,
          message: {
            title: `${people.customer.name} has not joined`,
            body: paid
              ? `You have waited ${minutes} minutes, so you can leave. You keep your payout.`
              : `You have waited ${minutes} minutes, so you can leave.`,
            path: bookingPath,
            tag: `booking-${booking.id}`,
            ttlSeconds: 20 * 60,
          },
        },
        {
          userId: booking.customer_id,
          message: {
            title: `${people.expert.name} waited ${minutes} minutes for you`,
            body: `They are free to leave now. Join at once if you still can.`,
            path: joinPath(booking.id, await joinKey(env.serviceKey, booking.id, 'customer')),
            tag: `booking-${booking.id}`,
            ttlSeconds: 20 * 60,
          },
        },
      ]);
      if (people.expert.email) {
        await sendEmail(
          env,
          people.expert.email,
          `${people.customer.name} has not joined your ${what}`,
          emailShell(
            [
              para(`Hi ${escapeHtml(people.expert.name)},`),
              para(
                `It is ${minutes} minutes past the start and ${escapeHtml(people.customer.name)} is not in the call. You have waited the full ${minutes} minutes, so you can leave.`,
              ),
              para(
                paid
                  ? `You keep your payout for this ${what}. If ${escapeHtml(people.customer.name)} turns up and you choose to stay, that is up to you.`
                  : `If ${escapeHtml(people.customer.name)} turns up and you choose to stay, that is up to you.`,
              ),
              para('Thanks for waiting,<br>Palam'),
            ].join('\n'),
          ),
        );
      }
      if (people.customer.email) {
        await sendEmail(
          env,
          people.customer.email,
          `${people.expert.name} waited ${minutes} minutes for you`,
          emailShell(
            [
              para(`Hi ${escapeHtml(people.customer.name)},`),
              para(
                `Your ${what} with ${escapeHtml(people.expert.name)} started at ${clockTime(booking.start_at, people.customer.tz, people.customer.tzKnown)}. ${escapeHtml(people.expert.name)} waited ${minutes} minutes in the call and is now free to leave.`,
              ),
              para(
                paid
                  ? `If you can still make it, join at once. A ${what} you miss is not refunded.`
                  : 'If you can still make it, join at once.',
              ),
              emailButton('Join the call', customerLink),
              para('Palam'),
            ].join('\n'),
          ),
        );
      }
    }
    sent += 1;
  }
  return sent;
};

// ---- After the session ----------------------------------------------------

const REVIEW_REASONS: Record<string, string> = {
  no_record:
    'The room has no usable record for this session, although at least one person opened the call through Palam. Palam or the video service may have been at fault.',
  untracked_visitor:
    'Someone was in the room without a personal pass (an old link to the room), so the record cannot say who was there.',
  both_absent: 'Neither person shows in the room.',
  both_left_early:
    'Both were in the room at the 10-minute mark but spent under 5 minutes together. The visits below show who left.',
  expert_did_not_wait:
    'The customer was not there at the 10-minute mark, and the expert had not waited the full time either (arrived late, or came and went).',
};

const ownerAlert = async (
  admin: Admin,
  env: SettleEnv,
  booking: SettleBooking,
  people: { customer: Person; expert: Person },
  decision: Decision,
  refund: RefundResult | null,
  strikes: { total: number; pausedNow: boolean } | null,
  config: Config,
) => {
  const tz = env.defaultTz ?? 'UTC';
  const owner: Person = { name: 'Palam', email: env.alertEmail, emailReminders: true, smsPhone: null, tz, tzKnown: false };
  const title =
    decision.outcome === 'expert_no_show'
      ? `Expert no-show: ${people.expert.name} missed ${people.customer.name}`
      : decision.outcome === 'customer_no_show'
        ? `Customer no-show: ${people.customer.name} missed ${people.expert.name}`
        : `Needs your review: ${people.customer.name} and ${people.expert.name}`;
  const moneyLine =
    decision.outcome === 'expert_no_show'
      ? !isPaid(booking)
        ? 'Nothing was paid for this one, so there is nothing to refund.'
        : refund === null
          ? `Automatic refunds are switched off. Refund ${money(booking.price_cents)} in Stripe (Payments, find the payment, Refund, and tick the boxes to reverse the transfer and refund the application fee).`
          : refund.status === 'refunded'
            ? refund.reversed
              ? `Refunded ${money(booking.price_cents)} to the customer automatically. The expert's share was pulled back and Palam's fee returned, so Palam is out only Stripe's processing fee.`
              : `Refunded ${money(booking.price_cents)} to the customer automatically, <strong>but the expert's share could not be pulled back</strong> (their Stripe balance had most likely been paid out already). Palam has covered it for now. In Stripe, open the payment and reverse the transfer once the expert's balance allows.`
            : refund.status === 'already'
              ? 'This payment had already been refunded.'
              : refund.status === 'blocked'
                ? `<strong>The refund did not go through:</strong> ${escapeHtml(refund.reason)}. Refund ${money(booking.price_cents)} by hand in Stripe.`
                : 'Nothing was charged, so there was nothing to refund.'
      : decision.outcome === 'customer_no_show'
        ? isPaid(booking)
          ? 'No refund. The expert keeps the payout.'
          : 'Nothing was paid for this one.'
        : `Nothing has moved. ${isPaid(booking) ? `${money(booking.price_cents)} is with the expert as normal. If a refund is due, issue it in Stripe.` : 'Nothing was paid for this one.'}`;
  const strikeLine =
    strikes === null
      ? ''
      : strikes.pausedNow
        ? `That is ${strikes.total} missed sessions in ${config.strikeWindowDays} days, so the profile was paused automatically: hidden from Discover and closed to new bookings. Sessions already booked still stand.`
        : `Missed sessions for this expert in the last ${config.strikeWindowDays} days: ${strikes.total}. The profile is paused at ${config.strikeCount}.`;

  const rows: [string, string][] = [
    ['Session', `${shortWhen(booking.start_at, tz, false)} (${whatOf(booking)})`],
    ['Customer in the room', visitsText(decision.spans.customer, owner)],
    ['Expert in the room', visitsText(decision.spans.expert, owner)],
    ['Together', `${Math.round(decision.togetherSeconds / 60)} min`],
    [
      `At the ${config.graceMinutes}-minute mark`,
      `customer ${decision.atRollCall.customer ? 'there' : 'not there'}, expert ${decision.atRollCall.expert ? 'there' : 'not there'}`,
    ],
    [
      'Opened the call through Palam',
      `customer ${booking.customer_joined_at ? 'yes' : 'no'}, expert ${booking.expert_joined_at ? 'yes' : 'no'}`,
    ],
  ];
  const table = `<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#6b7280;vertical-align:top;">${k}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>`;

  await sendEmail(
    env,
    env.alertEmail,
    title,
    emailShell(
      [
        para(`<strong>${escapeHtml(title)}</strong>`),
        decision.reason ? para(REVIEW_REASONS[decision.reason] ?? decision.reason) : '',
        table,
        para(moneyLine),
        strikeLine ? para(strikeLine) : '',
        decision.outcome === 'expert_no_show'
          ? para(
              `Both people have been told, and the expert can write in within 48 hours. To excuse the strike, set <strong>no_show_strike</strong> to false on booking ${booking.id}.`,
            )
          : decision.outcome === 'customer_no_show'
            ? para('Both people have been told, and the customer can write in within 48 hours.')
            : para(`Neither person has been told anything. Booking ${booking.id}.`),
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );
};

const tellPeople = async (
  admin: Admin,
  env: SettleEnv,
  booking: SettleBooking,
  people: { customer: Person; expert: Person },
  decision: Decision,
  refund: RefundResult | null,
  strikes: { total: number; pausedNow: boolean } | null,
  config: Config,
) => {
  const what = whatOf(booking);
  const paid = isPaid(booking);
  const path = `/booking/${booking.id}`;
  const url = `${APP_URL}${path}`;
  const { customer, expert } = people;
  const when = (who: Person) => shortWhen(booking.start_at, who.tz, who.tzKnown);
  const contest = `If this is not right, write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#0F6E56;">${SUPPORT_EMAIL}</a> within 48 hours and a person will look at it.`;

  if (decision.outcome === 'expert_no_show') {
    const refunded = refund?.status === 'refunded' || refund?.status === 'already';
    const refundLine = !paid
      ? `There was nothing to pay for this ${what}.`
      : refunded
        ? `We have refunded your ${money(booking.price_cents)} in full. Banks usually take 5 to 10 business days to show it on your statement.`
        : `You are owed a full refund of ${money(booking.price_cents)}. We are sending it now and will email you if anything holds it up.`;
    await pushToUsers(admin, [
      {
        userId: booking.customer_id,
        message: {
          title: `Your ${what} with ${expert.name} did not happen`,
          body: !paid
            ? `${expert.name} did not join. We are sorry.`
            : refunded
              ? `${expert.name} did not join. You have been refunded in full.`
              : `${expert.name} did not join. Your full refund is on its way.`,
          path,
          tag: `booking-${booking.id}`,
          ttlSeconds: 24 * 60 * 60,
        },
      },
      {
        userId: booking.expert_profile_id,
        message: {
          title: `You missed your ${what} with ${customer.name}`,
          body: strikes?.pausedNow
            ? 'Your profile is paused. Check your email.'
            : paid
              ? 'The customer was refunded and a missed session is on your record. Check your email.'
              : 'A missed session is on your record. Check your email.',
          path,
          tag: `booking-${booking.id}`,
          ttlSeconds: 24 * 60 * 60,
        },
      },
    ]);
    if (customer.email) {
      await sendEmail(
        env,
        customer.email,
        paid && refunded
          ? `Your ${what} with ${expert.name} did not happen. You have been refunded.`
          : `Your ${what} with ${expert.name} did not happen`,
        emailShell(
          [
            para(`Hi ${escapeHtml(customer.name)},`),
            para(
              `${escapeHtml(expert.name)} did not join your ${what} on ${when(customer)}. We are sorry. That is not what you booked.`,
            ),
            para(refundLine),
            para(
              `You do not need to report anything. Palam keeps a record of who was in the call, and that is how we knew.`,
            ),
            emailButton('Find another expert', `${APP_URL}/`),
            para('Palam'),
          ].join('\n'),
        ),
      );
    }
    if (expert.email) {
      const pauseLine = strikes?.pausedNow
        ? `That is ${strikes.total} missed sessions in ${config.strikeWindowDays} days, so your profile is paused. It is hidden from Discover and closed to new bookings. Sessions you already have still stand. Write to ${SUPPORT_EMAIL} and we will review it with you.`
        : `A missed session is now on your record. ${config.strikeCount} within ${config.strikeWindowDays} days pauses your profile.`;
      await sendEmail(
        env,
        expert.email,
        `You missed your ${what} with ${customer.name}`,
        emailShell(
          [
            para(`Hi ${escapeHtml(expert.name)},`),
            para(
              `The call's record shows you were not there for your ${what} with ${escapeHtml(customer.name)} on ${when(expert)}.`,
            ),
            para(
              `<strong>You were in the call:</strong> ${escapeHtml(visitsText(decision.spans.expert, expert))}<br><strong>${escapeHtml(customer.name)} was in the call:</strong> ${escapeHtml(visitsText(decision.spans.customer, expert))}`,
            ),
            para(
              `An expert needs to be in the call ${config.graceMinutes} minutes after the start. ${paid ? `${escapeHtml(customer.name)} has been refunded in full, so there is no payout for this ${what}. ` : ''}${pauseLine}`,
            ),
            para(`${contest} Tell us what happened, for example if the call would not load.`),
            emailButton('Open the booking', url),
            para('Palam'),
          ].join('\n'),
        ),
      );
    }
    return;
  }

  if (decision.outcome === 'customer_no_show') {
    await pushToUsers(admin, [
      {
        userId: booking.expert_profile_id,
        message: {
          title: `${customer.name} did not join`,
          body: paid ? `You waited, so you keep your payout for this ${what}.` : `Thanks for waiting.`,
          path,
          tag: `booking-${booking.id}`,
          ttlSeconds: 24 * 60 * 60,
        },
      },
      {
        userId: booking.customer_id,
        message: {
          title: `You missed your ${what} with ${expert.name}`,
          body: paid ? `${expert.name} waited for you. A missed ${what} is not refunded.` : `${expert.name} waited for you.`,
          path,
          tag: `booking-${booking.id}`,
          ttlSeconds: 24 * 60 * 60,
        },
      },
    ]);
    if (expert.email) {
      await sendEmail(
        env,
        expert.email,
        `${customer.name} did not join your ${what}`,
        emailShell(
          [
            para(`Hi ${escapeHtml(expert.name)},`),
            para(
              `${escapeHtml(customer.name)} did not join your ${what} on ${when(expert)}. The call's record shows you were there: ${escapeHtml(visitsText(decision.spans.expert, expert))}.`,
            ),
            para(
              paid
                ? `You waited the full ${config.graceMinutes} minutes, so you keep your payout for this ${what}. There is nothing you need to do.`
                : 'Thanks for waiting. There is nothing you need to do.',
            ),
            para('Palam'),
          ].join('\n'),
        ),
      );
    }
    if (customer.email) {
      await sendEmail(
        env,
        customer.email,
        `You missed your ${what} with ${expert.name}`,
        emailShell(
          [
            para(`Hi ${escapeHtml(customer.name)},`),
            para(
              `Your ${what} with ${escapeHtml(expert.name)} was on ${when(customer)}. ${escapeHtml(expert.name)} waited in the call, and the call's record does not show you joining in the first ${config.graceMinutes} minutes.`,
            ),
            para(
              paid
                ? `Under Palam's policy a ${what} the customer misses is not refunded, and the expert keeps the payout.`
                : `You can book another time whenever you are ready.`,
            ),
            para(`${contest} Tell us what happened, for example if the call would not load.`),
            emailButton('Open the booking', url),
            para('Palam'),
          ].join('\n'),
        ),
      );
    }
  }
};

const strikesFor = async (admin: Admin, booking: SettleBooking, config: Config, nowMs: number) => {
  const since = new Date(nowMs - config.strikeWindowDays * 24 * 60 * 60_000).toISOString();
  const [{ count }, { data: standing }] = await Promise.all([
    admin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('expert_profile_id', booking.expert_profile_id)
      .eq('no_show_strike', true)
      .gt('start_at', since),
    admin
      .from('expert_profiles')
      .select('palam_paused_at, palam_pause_reason')
      .eq('profile_id', booking.expert_profile_id)
      .maybeSingle(),
  ]);
  const pausedNow =
    standing?.palam_pause_reason === 'no_shows' &&
    Boolean(standing?.palam_paused_at) &&
    nowMs - Date.parse(standing.palam_paused_at as string) < 10 * 60_000;
  return { total: count ?? 0, pausedNow };
};

export const settleSessions = async (
  admin: Admin,
  env: SettleEnv,
  nowMs: number,
): Promise<{ decided: number; refunded: number; review: number }> => {
  const tally = { decided: 0, refunded: 0, review: 0 };
  const config = await loadConfig(admin);
  const { data: finished, error } = await admin
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('medium', 'video')
    .in('status', ['confirmed', 'in_progress', 'completed'])
    .is('attendance_decided_at', null)
    .lte('end_at', new Date(nowMs - SETTLE_AFTER_END_MS).toISOString())
    .gt('end_at', new Date(nowMs - 24 * 60 * 60_000).toISOString());
  if (error) {
    console.error('settle lookup failed', error.message);
    return tally;
  }

  for (const booking of (finished ?? []) as SettleBooking[]) {
    if (Date.parse(booking.start_at) < config.liveFrom) continue;
    try {
      const recordOk = await reconcile(admin, env, booking);
      const visits = await loadVisits(admin, booking.id);
      const decision = decideFor(booking, visits, config, nowMs, recordOk);

      // Claimed first: whoever writes the outcome is the one who acts on it.
      const { data: claimed, error: claimError } = await admin
        .from('bookings')
        .update({
          attendance_outcome: decision.outcome,
          attendance_decided_at: new Date(nowMs).toISOString(),
          attendance_detail: summarise(decision),
          no_show_strike: decision.strike,
        })
        .eq('id', booking.id)
        .is('attendance_decided_at', null)
        .select('id');
      if (claimError) {
        console.error('settle claim failed', booking.id, claimError.message);
        continue;
      }
      if (!claimed || claimed.length === 0) continue;
      tally.decided += 1;
      if (decision.outcome === 'held' || decision.outcome === 'short') continue;

      let refund: RefundResult | null = null;
      if (decision.refund && isPaid(booking) && config.autoRefund && env.stripeKey) {
        refund = await refundPayment(env.stripeKey, {
          paymentIntentId: booking.stripe_payment_intent_id,
          bookingId: booking.id,
          why: 'expert_no_show',
          note: `expert no-show, decided from the call record (${decision.rule})`,
        });
        if (refund.status === 'refunded' || refund.status === 'already') {
          tally.refunded += 1;
          await admin
            .from('bookings')
            .update({
              payment_status: 'refunded',
              ...(refund.status === 'refunded' ? { stripe_refund_id: refund.refundId } : {}),
            })
            .eq('id', booking.id);
        } else if (refund.status === 'released') {
          await admin.from('bookings').update({ payment_status: 'released' }).eq('id', booking.id);
        }
      }
      if (decision.outcome === 'needs_review') tally.review += 1;

      const people = await loadPeople(admin, env, booking);
      const strikes = decision.strike ? await strikesFor(admin, booking, config, nowMs) : null;
      if (await claim(admin, booking.id, 'attendance_result')) {
        await tellPeople(admin, env, booking, people, decision, refund, strikes, config);
        await ownerAlert(admin, env, booking, people, decision, refund, strikes, config);
      }
    } catch (err) {
      console.error('settle failed', booking.id, err);
    }
  }
  return tally;
};

// What would be decided for one booking right now. Nothing is written and
// nobody is told. For the owner, and for checking the rules against a real
// call.
export const previewDecision = async (admin: Admin, env: SettleEnv, bookingId: string, nowMs: number) => {
  const { data: booking } = await admin.from('bookings').select(BOOKING_COLUMNS).eq('id', bookingId).maybeSingle();
  if (!booking) return { error: 'No such booking' };
  const config = await loadConfig(admin);
  const visits = await loadVisits(admin, bookingId);
  const room = (booking as SettleBooking).daily_room_name ?? roomNameFor(bookingId);
  const [live, meetings] = env.dailyKey
    ? await Promise.all([whoIsInRoom(env.dailyKey, room), roomMeetings(env.dailyKey, room)])
    : [null, null];
  const decision = decideFor(booking as SettleBooking, visits, config, nowMs, true);
  return {
    outcome: decision.outcome,
    rule: decision.rule,
    reason: decision.reason,
    strike: decision.strike,
    refund: decision.refund,
    summary: summarise(decision),
    recorded: visits.length,
    inRoomNow: live,
    dailyList: meetings,
    // What a refund would do. Nothing is refunded here.
    payment: env.stripeKey
      ? await inspectPayment(env.stripeKey, (booking as SettleBooking).stripe_payment_intent_id)
      : { found: false, reason: 'no Stripe key' },
  };
};
