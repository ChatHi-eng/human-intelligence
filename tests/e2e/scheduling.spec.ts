// Scheduling rules, tested directly (no browser): time zones, days off,
// minimum notice, taken slots and the weekly-hours clean-up.
import { expect, test } from '@playwright/test';
import { generateSlots, normalizeWindows } from '../../lib/slots';

// Monday 2 Nov 2026, 12:00 UTC. New York is on standard time (UTC-5), so it
// is 07:00 there; London is on UTC.
const NOW = new Date('2026-11-02T12:00:00Z');
const MON_9_TO_11 = [
  { weekday: 1 as const, startMinute: 9 * 60, endMinute: 11 * 60, kind: 'session' as const },
];

test('hours are read in the expert time zone, not the viewer one', () => {
  const slots = generateSlots(MON_9_TO_11, [], [], {
    timeZone: 'America/New_York',
    now: NOW,
    daysAhead: 1,
  });
  // 9:00 in New York is 14:00 UTC, whoever is looking.
  expect(slots.map((s) => s.startIso)).toEqual([
    '2026-11-02T14:00:00.000Z',
    '2026-11-02T14:30:00.000Z',
    '2026-11-02T15:00:00.000Z',
    '2026-11-02T15:30:00.000Z',
  ]);
});

test('the same hours land an hour earlier in UTC once daylight saving starts', () => {
  // Monday 9 Mar 2026 is the day after US clocks go forward (UTC-4).
  const slots = generateSlots(MON_9_TO_11, [], [], {
    timeZone: 'America/New_York',
    now: new Date('2026-03-09T05:00:00Z'),
    daysAhead: 1,
  });
  expect(slots[0]?.startIso).toBe('2026-03-09T13:00:00.000Z');
});

test('a day off closes the whole date, extra hours add to it', () => {
  const dayOff = [
    { id: 'a', date: '2026-11-02', startMinute: 0, endMinute: 1440, blocked: true },
  ];
  expect(
    generateSlots(MON_9_TO_11, dayOff, [], { timeZone: 'America/New_York', now: NOW, daysAhead: 1 }),
  ).toHaveLength(0);

  const extra = [
    { id: 'b', date: '2026-11-02', startMinute: 13 * 60, endMinute: 14 * 60, blocked: false },
  ];
  expect(
    generateSlots(MON_9_TO_11, extra, [], { timeZone: 'America/New_York', now: NOW, daysAhead: 1 }),
  ).toHaveLength(6);
});

test('taken times and times inside the notice period are not offered', () => {
  const busy = [{ startIso: '2026-11-02T15:00:00.000Z', endIso: '2026-11-02T15:30:00.000Z' }];
  const slots = generateSlots(MON_9_TO_11, [], busy, {
    timeZone: 'America/New_York',
    now: NOW,
    daysAhead: 1,
    // 12:00 UTC + 2h30 = 14:30 UTC, so 14:00 and 14:30 are too soon.
    minNoticeMinutes: 150,
  });
  expect(slots.map((s) => s.startIso)).toEqual(['2026-11-02T15:30:00.000Z']);
});

test('the gap between sessions keeps neighbouring times free', () => {
  const busy = [{ startIso: '2026-11-02T15:00:00.000Z', endIso: '2026-11-02T15:30:00.000Z' }];
  const slots = generateSlots(MON_9_TO_11, [], busy, {
    timeZone: 'America/New_York',
    now: NOW,
    daysAhead: 1,
    bufferMinutes: 15,
  });
  // 14:30 ends at 15:00 and 15:30 starts right after: both are inside the gap.
  expect(slots.map((s) => s.startIso)).toEqual(['2026-11-02T14:00:00.000Z']);
});

test('free intro hours produce 15-minute slots', () => {
  const introHours = [
    { weekday: 1 as const, startMinute: 12 * 60, endMinute: 13 * 60, kind: 'intro' as const },
  ];
  const slots = generateSlots(introHours, [], [], {
    timeZone: 'America/New_York',
    now: NOW,
    daysAhead: 1,
    slotMinutes: 15,
  });
  expect(slots).toHaveLength(4);
  expect(slots[0]).toMatchObject({
    startIso: '2026-11-02T17:00:00.000Z',
    endIso: '2026-11-02T17:15:00.000Z',
  });
});

test('overlapping weekly blocks are merged when saved', () => {
  expect(
    normalizeWindows([
      { weekday: 2, startMinute: 600, endMinute: 720, kind: 'session' },
      { weekday: 1, startMinute: 540, endMinute: 660, kind: 'session' },
      { weekday: 1, startMinute: 600, endMinute: 780, kind: 'session' },
    ]),
  ).toEqual([
    { weekday: 1, startMinute: 540, endMinute: 780, kind: 'session' },
    { weekday: 2, startMinute: 600, endMinute: 720, kind: 'session' },
  ]);
});
