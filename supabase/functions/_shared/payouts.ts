// Holding an expert's money until the session is settled, then paying it out.
//
//   holdNewAccounts  switches any expert Stripe account that is still on
//                    Stripe's own daily schedule over to manual payouts, so
//                    the money stays in their Stripe balance until Palam
//                    sends it
//   releasePayouts   pays out each held booking once it falls due: 48 hours
//                    (app_config.payout_hold_hours) after the scheduled
//                    finish, and only for a session the call's record says
//                    stands
//   payoutsOverview  what is held for whom, for the owner. Changes nothing.
//
// Each payout is for exactly one booking's amount (the price less Palam's
// fee), so paying one session never sweeps up money held for another.
// Called from send-reminders, every two minutes. Migration 0034.

import { APP_URL, pushToUsers, shortWhen } from './notify.ts';
import { stripeCall, stripeMessage } from './refund.ts';
import { claim, emailShell, escapeHtml, para, sendEmail, type AlertEnv } from './session-alerts.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

export type PayoutEnv = AlertEnv & { stripeKey?: string; alertEmail: string };

// A payout still waiting this long after it fell due: the owner is told.
const OVERDUE_MS = 24 * 60 * 60_000;
// "Being sent" for longer than this means a run died half way: try again
// (the same idempotency key, so Stripe never sends it twice).
const STUCK_MS = 5 * 60_000;

const money = (cents: number) => {
  const value = cents / 100;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
};

export const holdNewAccounts = async (admin: Admin, env: PayoutEnv): Promise<number> => {
  if (!env.stripeKey) return 0;
  const { data: open } = await admin
    .from('expert_profiles')
    .select('profile_id, stripe_connect_account_id')
    .not('stripe_connect_account_id', 'is', null)
    .is('payouts_held_at', null);
  let switched = 0;
  // deno-lint-ignore no-explicit-any
  for (const expert of (open ?? []) as any[]) {
    const res = await stripeCall(
      env.stripeKey,
      'POST',
      `/accounts/${encodeURIComponent(expert.stripe_connect_account_id)}`,
      { 'settings[payouts][schedule][interval]': 'manual' },
    );
    if (!res.ok) {
      console.error('payout hold failed', expert.profile_id, stripeMessage(res.body, `status ${res.status}`));
      continue;
    }
    const { error } = await admin
      .from('expert_profiles')
      .update({ payouts_held_at: new Date().toISOString() })
      .eq('profile_id', expert.profile_id)
      .is('payouts_held_at', null);
    if (error) console.error('payout hold save failed', expert.profile_id, error.message);
    else switched += 1;
  }
  return switched;
};

type PayoutBooking = {
  id: string;
  customer_id: string;
  expert_profile_id: string;
  start_at: string;
  end_at: string;
  status: string;
  kind: string | null;
  payment_status: string;
  price_cents: number | null;
  stripe_application_fee_cents: number | null;
  payout_state: string;
  payout_note: string | null;
  attendance_outcome: string | null;
  no_show_reported_at: string | null;
  cancelled_by: string | null;
  updated_at: string;
};

const COLUMNS =
  'id, customer_id, expert_profile_id, start_at, end_at, status, kind, payment_status, price_cents, stripe_application_fee_cents, payout_state, payout_note, attendance_outcome, no_show_reported_at, cancelled_by, updated_at';

// Why a held booking is not being paid yet, or null when it can be.
const blocker = (b: PayoutBooking): string | null => {
  if (b.payment_status !== 'captured') return 'the payment is no longer in place (refunded or released)';
  if (b.payout_state === 'approved') return null;
  if (b.no_show_reported_at) return 'a no-show was reported on this session and nobody has ruled on it';
  if (b.status === 'cancelled') {
    return b.cancelled_by === 'customer'
      ? null
      : 'the booking was cancelled, but not by the customer, and the payment was not refunded';
  }
  if (b.attendance_outcome === 'held' || b.attendance_outcome === 'short' || b.attendance_outcome === 'customer_no_show') {
    return null;
  }
  if (b.attendance_outcome === 'needs_review') return 'the session is waiting for your review';
  if (b.attendance_outcome === 'expert_no_show') return 'the expert missed the session and the refund has not gone through';
  return 'the session was never settled from the call record';
};

export const releasePayouts = async (
  admin: Admin,
  env: PayoutEnv,
  nowMs: number,
): Promise<{ released: number; waiting: number }> => {
  const tally = { released: 0, waiting: 0 };
  if (!env.stripeKey) return tally;
  const { data: config } = await admin.from('app_config').select('payout_hold_hours').maybeSingle();
  const holdMs = (config?.payout_hold_hours ?? 48) * 60 * 60_000;

  const { data: due, error } = await admin
    .from('bookings')
    .select(COLUMNS)
    .in('payout_state', ['held', 'approved', 'releasing'])
    .lte('end_at', new Date(nowMs - holdMs).toISOString())
    .order('end_at', { ascending: true })
    .limit(50);
  if (error) {
    console.error('payout lookup failed', error.message);
    return tally;
  }

  for (const booking of (due ?? []) as PayoutBooking[]) {
    if (booking.payout_state === 'releasing' && nowMs - Date.parse(booking.updated_at) < STUCK_MS) continue;
    if (booking.payment_status !== 'captured') {
      // Refunded, or the hold was let go: there is nothing left to pay out.
      await admin
        .from('bookings')
        .update({ payout_state: null, payout_note: 'payment refunded or released, nothing to pay out' })
        .eq('id', booking.id);
      continue;
    }
    const dueAt = Date.parse(booking.end_at) + holdMs;
    const cents = (booking.price_cents ?? 0) - (booking.stripe_application_fee_cents ?? 0);
    let waitingOn = blocker(booking);

    if (!waitingOn && cents > 0) {
      const { data: expert } = await admin
        .from('expert_profiles')
        .select('stripe_connect_account_id')
        .eq('profile_id', booking.expert_profile_id)
        .maybeSingle();
      const account = expert?.stripe_connect_account_id as string | null | undefined;
      if (!account) {
        waitingOn = 'the expert has no Stripe account on file';
      } else {
        // Claimed first, so two runs never both send it.
        const { data: mine } = await admin
          .from('bookings')
          .update({ payout_state: 'releasing' })
          .eq('id', booking.id)
          .eq('payout_state', booking.payout_state)
          .select('id');
        if (!mine || mine.length === 0) continue;

        const sent = await stripeCall(
          env.stripeKey,
          'POST',
          '/payouts',
          {
            amount: String(cents),
            currency: 'usd',
            description: 'Palam session',
            'metadata[booking_id]': booking.id,
          },
          `payout:${booking.id}`,
          account,
        );
        if (sent.ok) {
          await admin
            .from('bookings')
            .update({
              payout_state: 'released',
              payout_released_at: new Date(nowMs).toISOString(),
              stripe_payout_id: sent.body.id,
              payout_note: null,
            })
            .eq('id', booking.id);
          tally.released += 1;
          try {
            const { data: customer } = await admin
              .from('profiles')
              .select('display_name')
              .eq('id', booking.customer_id)
              .maybeSingle();
            await pushToUsers(admin, [
              {
                userId: booking.expert_profile_id,
                message: {
                  title: `Payout sent: ${money(cents)}`,
                  body: `For your session with ${customer?.display_name ?? 'your customer'}. Banks usually take 1 to 2 business days.`,
                  path: '/studio/earnings',
                  tag: `payout-${booking.id}`,
                  ttlSeconds: 24 * 60 * 60,
                },
              },
            ]);
          } catch (err) {
            console.error('payout push failed', err);
          }
          continue;
        }
        // Not sent. Put it back, with Stripe's reason, to try again next run.
        waitingOn =
          sent.body?.error?.code === 'balance_insufficient'
            ? "the money is not yet available in the expert's Stripe balance (Stripe releases card payments after about two business days)"
            : `Stripe would not send it: ${stripeMessage(sent.body, `status ${sent.status}`)}`;
        await admin
          .from('bookings')
          .update({ payout_state: booking.payout_state === 'approved' ? 'approved' : 'held' })
          .eq('id', booking.id);
      }
    } else if (!waitingOn && cents <= 0) {
      await admin.from('bookings').update({ payout_state: 'released', payout_note: 'nothing to pay' }).eq('id', booking.id);
      continue;
    }

    tally.waiting += 1;
    if (waitingOn && waitingOn !== booking.payout_note) {
      await admin.from('bookings').update({ payout_note: waitingOn }).eq('id', booking.id);
    }
    // A day overdue, and the money is still there to pay: tell the owner, once.
    if (booking.payment_status === 'captured' && nowMs - dueAt >= OVERDUE_MS && (await claim(admin, booking.id, 'payout_overdue'))) {
      const { data: names } = await admin
        .from('profiles')
        .select('id, display_name')
        .in('id', [booking.customer_id, booking.expert_profile_id]);
      // deno-lint-ignore no-explicit-any
      const nameOf = (id: string) => ((names ?? []) as any[]).find((r) => r.id === id)?.display_name ?? 'unknown';
      const title = `A payout is waiting on you: ${money(cents)} for ${nameOf(booking.expert_profile_id)}`;
      await sendEmail(
        env,
        env.alertEmail,
        title,
        emailShell(
          [
            para(`<strong>${escapeHtml(title)}</strong>`),
            para(
              `Session with ${escapeHtml(nameOf(booking.customer_id))} on ${shortWhen(booking.start_at, env.defaultTz ?? 'UTC', false)}. It should have been paid out a day ago and has not been, because ${escapeHtml(waitingOn ?? 'of an unknown problem')}.`,
            ),
            para(
              `To pay it out at the next run, set <strong>payout_state</strong> to <strong>approved</strong> on booking ${booking.id}. To keep holding it, set it to <strong>on_hold</strong>. If the customer should be refunded instead, refund the payment in Stripe.`,
            ),
            para(`<a href="${APP_URL}/booking/${booking.id}" style="color:#0F6E56;">Open the booking</a>`),
          ].join('\n'),
        ),
      );
    }
  }
  return tally;
};

// For the owner: every expert with a Stripe account, how Stripe is set to
// pay them, what is in their balance, and what Palam is holding. Read only.
export const payoutsOverview = async (admin: Admin, env: PayoutEnv) => {
  if (!env.stripeKey) return { error: 'no Stripe key' };
  const { data: experts } = await admin
    .from('expert_profiles')
    .select('profile_id, stripe_connect_account_id, payouts_held_at')
    .not('stripe_connect_account_id', 'is', null);
  const out = [];
  // deno-lint-ignore no-explicit-any
  for (const expert of (experts ?? []) as any[]) {
    const account = expert.stripe_connect_account_id as string;
    const [details, balance, recent, held] = await Promise.all([
      stripeCall(env.stripeKey, 'GET', `/accounts/${encodeURIComponent(account)}`),
      stripeCall(env.stripeKey, 'GET', '/balance', undefined, undefined, account),
      stripeCall(env.stripeKey, 'GET', '/payouts?limit=5', undefined, undefined, account),
      admin
        .from('bookings')
        .select('id, end_at, price_cents, stripe_application_fee_cents, payout_state, attendance_outcome, payout_note')
        .eq('expert_profile_id', expert.profile_id)
        .in('payout_state', ['held', 'approved', 'on_hold', 'releasing']),
    ]);
    // deno-lint-ignore no-explicit-any
    const sum = (list: any) =>
      // deno-lint-ignore no-explicit-any
      Array.isArray(list) ? list.reduce((s: number, x: any) => s + (x.currency === 'usd' ? x.amount : 0), 0) : null;
    out.push({
      expert: expert.profile_id,
      heldSince: expert.payouts_held_at,
      liveMode: details.ok ? Boolean(details.body.livemode) : null,
      schedule: details.ok ? details.body.settings?.payouts?.schedule?.interval ?? null : stripeMessage(details.body, 'lookup failed'),
      payoutsEnabled: details.ok ? Boolean(details.body.payouts_enabled) : null,
      balanceAvailableCents: balance.ok ? sum(balance.body.available) : null,
      balancePendingCents: balance.ok ? sum(balance.body.pending) : null,
      recentPayouts: recent.ok
        ? // deno-lint-ignore no-explicit-any
          (recent.body.data ?? []).map((p: any) => ({
            cents: p.amount,
            status: p.status,
            automatic: p.automatic,
            created: new Date(p.created * 1000).toISOString(),
          }))
        : null,
      // deno-lint-ignore no-explicit-any
      holding: ((held.data ?? []) as any[]).map((b) => ({
        booking: b.id,
        cents: (b.price_cents ?? 0) - (b.stripe_application_fee_cents ?? 0),
        state: b.payout_state,
        sessionEnds: b.end_at,
        outcome: b.attendance_outcome,
        note: b.payout_note,
      })),
    });
  }
  return { experts: out };
};
