// Who was in a session's video room, and what that means.
//
// The room reports every visit (when someone came in, when they left). This
// file turns those visits into a decision. It never looks at what either
// person says happened.
//
//   held              together for `heldMinutes` (20) or more
//   short             together for `floorMinutes` (5) up to that; stands as held
//   expert_no_show    under 5 minutes together, and either the expert was
//                     never in the room by roll call while the customer came,
//                     or the customer was there at roll call and the expert
//                     was not
//   customer_no_show  under 5 minutes together, the expert was there at roll
//                     call and for `waitMinutes` (5) of the minutes before it,
//                     and the customer was not there at roll call
//   needs_review      everything else. A person decides.
//
// Roll call is `graceMinutes` (10) after the scheduled start.
//
// No imports, on purpose: the app's tests load this file too.

export type AttendanceRole = 'customer' | 'expert';

// One visit to the room. Times are milliseconds since 1970. `end` is null
// while the person is still in the room (or the room never said they left).
export type Visit = { role: AttendanceRole | null; start: number; end: number | null };

export type AttendanceRules = {
  graceMinutes: number;
  waitMinutes: number;
  heldMinutes: number;
  floorMinutes: number;
};

export const DEFAULT_RULES: AttendanceRules = {
  graceMinutes: 10,
  waitMinutes: 5,
  heldMinutes: 20,
  floorMinutes: 5,
};

// A visit shorter than this is a page that opened and closed: ignored.
export const MIN_VISIT_MS = 15_000;
// Leaving and coming back inside this long (a refresh, a dropped connection)
// counts as never having left.
export const BRIDGE_MS = 60_000;
// Time in the room earlier than this before the start is not counted.
export const EARLY_MS = 20 * 60_000;

export type Outcome = 'held' | 'short' | 'expert_no_show' | 'customer_no_show' | 'needs_review';

export type ReviewReason =
  | 'no_record'
  | 'untracked_visitor'
  | 'both_absent'
  | 'both_left_early'
  | 'expert_did_not_wait';

export type Span = [start: number, end: number];

export type Decision = {
  outcome: Outcome;
  // Which line of the table above decided it.
  rule: string;
  reason: ReviewReason | null;
  // The expert earns a strike.
  strike: boolean;
  // The customer is owed a full refund.
  refund: boolean;
  togetherSeconds: number;
  rollCallAt: number;
  atRollCall: { customer: boolean; expert: boolean };
  // Seconds the expert was in the room between the start and roll call.
  expertWaitSeconds: number;
  seconds: { customer: number; expert: number };
  spans: { customer: Span[]; expert: Span[] };
};

export type DecideInput = {
  startMs: number;
  endMs: number;
  // When the room shut (nobody can be in it after this).
  closeMs: number;
  // The moment of the decision. A visit with no end is taken to run until
  // then, or until the room shut, whichever came first.
  nowMs: number;
  visits: Visit[];
  rules?: Partial<AttendanceRules>;
  // Each person opened the call through Palam (join-call noted it).
  clicked?: { customer: boolean; expert: boolean };
  // False when the room's reports could not be trusted for this session.
  recordOk?: boolean;
};

// Tidies one person's visits: clipped to the session's window, tiny ones
// dropped, gaps under a minute closed.
export const presence = (
  visits: Visit[],
  role: AttendanceRole,
  windowStart: number,
  windowEnd: number,
  nowMs: number,
): Span[] => {
  const raw: Span[] = [];
  for (const v of visits) {
    if (v.role !== role) continue;
    const start = Math.max(v.start, windowStart);
    const end = Math.min(v.end ?? nowMs, windowEnd, nowMs);
    if (end - start >= MIN_VISIT_MS) raw.push([start, end]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const span of raw) {
    const last = merged[merged.length - 1];
    if (last && span[0] - last[1] < BRIDGE_MS) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
};

const total = (spans: Span[]) => spans.reduce((sum, [s, e]) => sum + (e - s), 0);

// How long two people were in the room at the same time.
export const overlap = (a: Span[], b: Span[]): number => {
  let sum = 0;
  for (const [as, ae] of a) {
    for (const [bs, be] of b) {
      const d = Math.min(ae, be) - Math.max(as, bs);
      if (d > 0) sum += d;
    }
  }
  return sum;
};

const within = (spans: Span[], from: number, to: number) =>
  spans.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, to) - Math.max(s, from)), 0);

const at = (spans: Span[], moment: number) => spans.some(([s, e]) => s <= moment && moment <= e);

export const decide = (input: DecideInput): Decision => {
  const rules = { ...DEFAULT_RULES, ...(input.rules ?? {}) };
  const windowStart = input.startMs - EARLY_MS;
  const windowEnd = input.closeMs;
  const rollCallAt = input.startMs + rules.graceMinutes * 60_000;

  const customer = presence(input.visits, 'customer', windowStart, windowEnd, input.nowMs);
  const expert = presence(input.visits, 'expert', windowStart, windowEnd, input.nowMs);
  const together = overlap(customer, expert);
  const atRollCall = { customer: at(customer, rollCallAt), expert: at(expert, rollCallAt) };
  const expertWait = within(expert, input.startMs, rollCallAt);
  // Someone the room could not put a name to was in there during the session.
  const stranger = input.visits.some((v) => {
    if (v.role !== null) return false;
    const start = Math.max(v.start, windowStart);
    const end = Math.min(v.end ?? input.nowMs, windowEnd, input.nowMs);
    return end - start >= MIN_VISIT_MS;
  });

  const base = {
    togetherSeconds: Math.round(together / 1000),
    rollCallAt,
    atRollCall,
    expertWaitSeconds: Math.round(expertWait / 1000),
    seconds: {
      customer: Math.round(total(customer) / 1000),
      expert: Math.round(total(expert) / 1000),
    },
    spans: { customer, expert },
  };
  const result = (
    outcome: Outcome,
    rule: string,
    extra: Partial<Pick<Decision, 'reason' | 'strike' | 'refund'>> = {},
  ): Decision => ({ outcome, rule, reason: null, strike: false, refund: false, ...extra, ...base });

  // The record itself is in doubt: a person looks before anything moves.
  if (input.recordOk === false) return result('needs_review', 'record', { reason: 'no_record' });
  if (stranger) return result('needs_review', 'record', { reason: 'untracked_visitor' });

  if (together >= rules.heldMinutes * 60_000) return result('held', 'held');
  if (together >= rules.floorMinutes * 60_000) return result('short', 'short');

  const clicked = input.clicked ?? { customer: false, expert: false };
  const expertByRollCall = expert.some(([s]) => s <= rollCallAt);

  if (!expertByRollCall) {
    if (customer.length > 0) {
      return result('expert_no_show', 'expert_never_came', { strike: true, refund: true });
    }
    // Nobody shows in the room. If both opened the call through Palam, the
    // room's reports are missing, not the people.
    return result('needs_review', 'nobody_in_room', {
      reason: clicked.customer && clicked.expert ? 'no_record' : 'both_absent',
    });
  }
  if (atRollCall.customer && !atRollCall.expert) {
    return result('expert_no_show', 'expert_gone_at_roll_call', { strike: true, refund: true });
  }
  if (atRollCall.expert && !atRollCall.customer) {
    if (expertWait >= rules.waitMinutes * 60_000) {
      return result('customer_no_show', 'customer_absent_expert_waited');
    }
    return result('needs_review', 'expert_arrived_late', { reason: 'expert_did_not_wait' });
  }
  if (atRollCall.expert && atRollCall.customer) {
    return result('needs_review', 'both_at_roll_call', { reason: 'both_left_early' });
  }
  return result('needs_review', 'nobody_at_roll_call', { reason: 'expert_did_not_wait' });
};

// The pass each person carries into the room names their side of the
// booking, so a visit can be put to a person without looking anything up.
// 33 characters; the room allows 36.
export const passId = (role: AttendanceRole, userId: string): string =>
  `${role === 'customer' ? 'c' : 'e'}${userId.replace(/-/g, '').toLowerCase()}`;

export const roleOfPass = (pass: string | null | undefined): AttendanceRole | null => {
  if (typeof pass !== 'string' || !/^[ce][0-9a-f]{32}$/.test(pass)) return null;
  return pass[0] === 'c' ? 'customer' : 'expert';
};

// What the people on the booking are shown: plain facts, no rule names.
export type AttendanceSummary = {
  togetherMinutes: number;
  customerMinutes: number;
  expertMinutes: number;
  customerFirstAt: string | null;
  expertFirstAt: string | null;
  customerAtRollCall: boolean;
  expertAtRollCall: boolean;
  rollCallAt: string;
  rule: string;
  reason: ReviewReason | null;
  spans: { customer: [string, string][]; expert: [string, string][] };
};

export const summarise = (d: Decision): AttendanceSummary => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const minutes = (s: number) => Math.round((s / 60) * 10) / 10;
  return {
    togetherMinutes: minutes(d.togetherSeconds),
    customerMinutes: minutes(d.seconds.customer),
    expertMinutes: minutes(d.seconds.expert),
    customerFirstAt: d.spans.customer[0] ? iso(d.spans.customer[0][0]) : null,
    expertFirstAt: d.spans.expert[0] ? iso(d.spans.expert[0][0]) : null,
    customerAtRollCall: d.atRollCall.customer,
    expertAtRollCall: d.atRollCall.expert,
    rollCallAt: iso(d.rollCallAt),
    rule: d.rule,
    reason: d.reason,
    spans: {
      customer: d.spans.customer.map(([s, e]) => [iso(s), iso(e)]),
      expert: d.spans.expert.map(([s, e]) => [iso(s), iso(e)]),
    },
  };
};
