// Giving a customer their money back, in full, the right way round.
//
// A paid session's money goes to the expert's Stripe account the moment the
// customer pays, less Palam's fee. Left to its defaults, a Stripe refund
// takes the whole amount from PALAM and leaves the expert holding their
// share. So every refund here also pulls the expert's share back
// (reverse_transfer) and hands back Palam's fee (refund_application_fee):
// the customer gets everything, the expert nets nothing, and Palam is out
// only Stripe's own processing fee.
//
// Plain HTTPS calls, no Stripe library, so the scheduled job that settles
// sessions stays light.

const STRIPE = 'https://api.stripe.com/v1';
const VERSION = '2024-06-20';

export type RefundResult =
  // Money went back. `reversed` is false when the expert's share could not
  // be pulled back and Palam covered it: the owner needs to know.
  | { status: 'refunded'; refundId: string; reversed: boolean; refundStatus: string }
  // Already refunded in full before this call.
  | { status: 'already' }
  // The card was only on hold; the hold was let go.
  | { status: 'released' }
  // Nothing was ever paid.
  | { status: 'nothing' }
  // Stripe would not do it (an open dispute, an error). Nothing moved.
  | { status: 'blocked'; reason: string };

type StripeError = { error?: { message?: string; code?: string } };

// One call to Stripe. `account` makes it act as an expert's own Stripe
// account (paying out their balance, reading it).
export const stripeCall = async (
  stripeKey: string,
  method: 'GET' | 'POST',
  path: string,
  form?: Record<string, string>,
  idempotencyKey?: string,
  account?: string,
) => {
  const res = await fetch(`${STRIPE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Stripe-Version': VERSION,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(account ? { 'Stripe-Account': account } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
  });
  // deno-lint-ignore no-explicit-any
  const body = (await res.json().catch(() => ({}))) as any;
  return { ok: res.ok, status: res.status, body };
};

export const stripeMessage = (body: StripeError, fallback: string) =>
  body?.error?.message ?? body?.error?.code ?? fallback;
const message = stripeMessage;
const call = stripeCall;

// What a refund of this payment would do, without doing it. For the owner,
// and for checking the refund path against Stripe with nothing moved.
export const inspectPayment = async (stripeKey: string, paymentIntentId: string | null) => {
  if (!paymentIntentId) return { found: false as const, reason: 'no payment on this booking' };
  const found = await call(
    stripeKey,
    'GET',
    `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`,
  );
  if (!found.ok) return { found: false as const, reason: message(found.body, `lookup ${found.status}`) };
  const pi = found.body;
  const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  return {
    found: true as const,
    // False while Stripe is in test mode.
    liveMode: Boolean(pi.livemode),
    status: pi.status as string,
    amountCents: pi.amount as number,
    // Money went on to an expert's Stripe account: a refund pulls it back.
    wouldPullBackExpertShare: Boolean(pi.transfer_data?.destination),
    wouldReturnPalamFeeCents:
      typeof pi.application_fee_amount === 'number' ? (pi.application_fee_amount as number) : 0,
    alreadyRefundedCents: typeof charge?.amount_refunded === 'number' ? (charge.amount_refunded as number) : 0,
    disputed: Boolean(charge?.disputed),
  };
};

// Refunds a booking's payment in full. `why` goes into the idempotency key,
// so the same refund asked for twice (a retry, an overlapping run) is made
// once.
export const refundPayment = async (
  stripeKey: string,
  input: { paymentIntentId: string | null; bookingId: string; why: string; note?: string },
): Promise<RefundResult> => {
  if (!input.paymentIntentId) return { status: 'nothing' };

  const found = await call(
    stripeKey,
    'GET',
    `/payment_intents/${encodeURIComponent(input.paymentIntentId)}?expand[]=latest_charge`,
  );
  if (!found.ok) return { status: 'blocked', reason: message(found.body, `lookup ${found.status}`) };
  const pi = found.body;

  if (pi.status === 'requires_capture') {
    const cancelled = await call(
      stripeKey,
      'POST',
      `/payment_intents/${encodeURIComponent(pi.id)}/cancel`,
      {},
      `release:${input.bookingId}`,
    );
    return cancelled.ok
      ? { status: 'released' }
      : { status: 'blocked', reason: message(cancelled.body, `release ${cancelled.status}`) };
  }
  if (pi.status !== 'succeeded') return { status: 'nothing' };

  const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  if (charge?.refunded) return { status: 'already' };
  if (charge && typeof charge.amount_refunded === 'number' && charge.amount_refunded > 0) {
    // Someone has already sent part of it back by hand. A person sorts out
    // the rest, so the two never add up to more than was paid.
    return { status: 'blocked', reason: 'part of this payment was already refunded by hand' };
  }
  if (charge?.disputed) {
    return { status: 'blocked', reason: 'the customer has an open dispute with their bank on this payment' };
  }

  const toExpert = Boolean(pi.transfer_data?.destination);
  const hasFee = typeof pi.application_fee_amount === 'number' && pi.application_fee_amount > 0;
  const base: Record<string, string> = {
    payment_intent: pi.id,
    reason: 'requested_by_customer',
    'metadata[booking_id]': input.bookingId,
    'metadata[why]': input.why,
    ...(input.note ? { 'metadata[note]': input.note.slice(0, 400) } : {}),
  };

  if (toExpert) {
    const full = await call(
      stripeKey,
      'POST',
      '/refunds',
      { ...base, reverse_transfer: 'true', ...(hasFee ? { refund_application_fee: 'true' } : {}) },
      `refund:${input.bookingId}:${input.why}`,
    );
    if (full.ok) {
      return { status: 'refunded', refundId: full.body.id, reversed: true, refundStatus: full.body.status };
    }
    console.error('refund with reversal failed', full.status, message(full.body, ''));
    if (full.body?.error?.code === 'charge_already_refunded') return { status: 'already' };
    // Stripe itself is having trouble: nothing is known about the expert's
    // balance, so do not fall back to Palam's money. A person retries.
    if (full.status >= 500 || full.status === 429 || full.status === 401) {
      return { status: 'blocked', reason: message(full.body, `refund ${full.status}`) };
    }
    // The expert's share could not be pulled back (their Stripe balance may
    // already have been paid out). The customer is not kept waiting for
    // that: refund from Palam, and say so.
  }

  const plain = await call(
    stripeKey,
    'POST',
    '/refunds',
    base,
    `refund:${input.bookingId}:${input.why}:plain`,
  );
  if (plain.ok) {
    return { status: 'refunded', refundId: plain.body.id, reversed: !toExpert, refundStatus: plain.body.status };
  }
  if (plain.body?.error?.code === 'charge_already_refunded') return { status: 'already' };
  return { status: 'blocked', reason: message(plain.body, `refund ${plain.status}`) };
};
