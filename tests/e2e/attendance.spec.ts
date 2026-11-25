import { expect, test } from '@playwright/test';
import {
  decide,
  passId,
  roleOfPass,
  type Visit,
} from '../../supabase/functions/_shared/attendance';

// The rules that settle a session from the video room's record of who was
// there. No browser: these check the decision itself.
//
// T0 is the scheduled start. The session is 30 minutes, the room shuts at
// T0+35, and the decision is made at T0+40.

const T0 = Date.UTC(2026, 10, 25, 17, 0, 0);
const min = (m: number) => T0 + m * 60_000;
const visit = (role: Visit['role'], from: number, to: number | null): Visit => ({
  role,
  start: min(from),
  end: to === null ? null : min(to),
});
const settle = (visits: Visit[], extra: Partial<Parameters<typeof decide>[0]> = {}) =>
  decide({ startMs: T0, endMs: min(30), closeMs: min(35), nowMs: min(40), visits, ...extra });

test('a full session is held', () => {
  const d = settle([visit('customer', -1, 31), visit('expert', 0, 31)]);
  expect(d.outcome).toBe('held');
  expect(d.togetherSeconds).toBe(31 * 60);
  expect(d.refund).toBe(false);
  expect(d.strike).toBe(false);
});

test('the expert never joins: refund and a strike, nothing to report', () => {
  const d = settle([visit('customer', -2, 14)]);
  expect(d.outcome).toBe('expert_no_show');
  expect(d.rule).toBe('expert_never_came');
  expect(d.refund).toBe(true);
  expect(d.strike).toBe(true);
});

test('the expert joins for two minutes and leaves; the customer arrives two minutes late', () => {
  // The owner's own example. The expert is gone at minute 10 and the
  // customer is there, so the expert is the no-show, whatever they claim.
  const d = settle([visit('expert', 0, 2), visit('customer', 2, 15)]);
  expect(d.outcome).toBe('expert_no_show');
  expect(d.rule).toBe('expert_gone_at_roll_call');
  expect(d.atRollCall).toEqual({ customer: true, expert: false });
  expect(d.refund).toBe(true);
  expect(d.strike).toBe(true);
});

test('had the expert stayed, the late customer would simply have started the session', () => {
  const d = settle([visit('expert', 0, 31), visit('customer', 2, 31)]);
  expect(d.outcome).toBe('held');
});

test('the customer never joins and the expert waits: the expert keeps the payout', () => {
  const d = settle([visit('expert', 0, 12)]);
  expect(d.outcome).toBe('customer_no_show');
  expect(d.refund).toBe(false);
  expect(d.strike).toBe(false);
  expect(d.expertWaitSeconds).toBe(600);
});

test('an expert who turns up at minute 9 has not waited, so a person decides', () => {
  const d = settle([visit('expert', 9, 12)]);
  expect(d.outcome).toBe('needs_review');
  expect(d.reason).toBe('expert_did_not_wait');
  expect(d.refund).toBe(false);
});

test('an expert who arrives after minute 10 to an empty room is still the no-show', () => {
  // The customer waited the ten minutes and left, as they were told they could.
  const d = settle([visit('customer', 0, 11), visit('expert', 12, 20)]);
  expect(d.outcome).toBe('expert_no_show');
  expect(d.rule).toBe('expert_never_came');
});

test('a late expert and a customer who stays: 20 minutes together counts', () => {
  const d = settle([visit('customer', 0, 35), visit('expert', 12, 35)]);
  expect(d.outcome).toBe('held');
  expect(d.togetherSeconds).toBe(23 * 60);
});

test('between 5 and 20 minutes together stands, marked as short', () => {
  const d = settle([visit('customer', 0, 12), visit('expert', 1, 12)]);
  expect(d.outcome).toBe('short');
  expect(d.refund).toBe(false);
});

test('nobody in the room at all goes to a person, never to an automatic strike', () => {
  expect(settle([]).reason).toBe('both_absent');
  // Both opened the call through Palam, yet the room shows nobody: the
  // record is what is missing.
  expect(settle([], { clicked: { customer: true, expert: true } }).reason).toBe('no_record');
  expect(settle([]).outcome).toBe('needs_review');
});

test('both there at minute 10 but barely together goes to a person', () => {
  const d = settle([visit('customer', 8, 11), visit('expert', 0, 10.5)]);
  expect(d.outcome).toBe('needs_review');
  expect(d.reason).toBe('both_left_early');
});

test('a refresh or a dropped connection does not count as leaving', () => {
  // The expert drops for 40 seconds right across minute 10.
  const d = settle([
    visit('customer', 0, 5),
    visit('expert', 0, 9.8),
    visit('expert', 10.4, 12),
  ]);
  expect(d.atRollCall.expert).toBe(true);
  expect(d.spans.expert).toHaveLength(1);
});

test('a page that opened and closed in ten seconds is not a visit', () => {
  const d = settle([visit('customer', 0, 14), { role: 'expert', start: min(1), end: min(1) + 10_000 }]);
  expect(d.spans.expert).toHaveLength(0);
  expect(d.outcome).toBe('expert_no_show');
});

test('a visit the room never closed runs to when the room shut', () => {
  const d = settle([visit('customer', 0, null), visit('expert', 0, null)]);
  expect(d.outcome).toBe('held');
  expect(d.togetherSeconds).toBe(35 * 60);
});

test('time in the room long before the start does not count', () => {
  // An expert who looked in an hour early and never came back.
  const d = settle([visit('expert', -60, -55), visit('customer', 0, 12)]);
  expect(d.spans.expert).toHaveLength(0);
  expect(d.outcome).toBe('expert_no_show');
});

test('someone in the room without a pass stops any automatic decision', () => {
  const d = settle([visit('customer', 0, 14), visit(null, 0, 14)]);
  expect(d.outcome).toBe('needs_review');
  expect(d.reason).toBe('untracked_visitor');
  expect(d.refund).toBe(false);
});

test('a record that cannot be trusted stops any automatic decision', () => {
  const d = settle([visit('customer', 0, 14)], { recordOk: false });
  expect(d.outcome).toBe('needs_review');
  expect(d.reason).toBe('no_record');
});

test('the numbers are settings', () => {
  const visits = [visit('expert', 0, 7)];
  expect(settle(visits).outcome).toBe('needs_review');
  expect(settle(visits, { rules: { graceMinutes: 6, waitMinutes: 5 } }).outcome).toBe('customer_no_show');
});

test('a pass names the side of the booking, and nothing else reads as one', () => {
  const user = '63c5ed5b-cc92-48bb-934b-e95e77d0fd81';
  expect(passId('customer', user)).toBe('c63c5ed5bcc9248bb934be95e77d0fd81');
  expect(passId('expert', user)).toHaveLength(33);
  expect(roleOfPass(passId('customer', user))).toBe('customer');
  expect(roleOfPass(passId('expert', user))).toBe('expert');
  expect(roleOfPass(user)).toBeNull();
  expect(roleOfPass(null)).toBeNull();
  expect(roleOfPass('x63c5ed5bcc9248bb934be95e77d0fd81')).toBeNull();
});
