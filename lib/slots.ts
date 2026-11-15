// Slot generation: given an expert's availability (weekly windows + specific
// dates), their time zone and the times already taken, produce concrete
// bookable slots for a look-ahead horizon.
//
// Availability is stored as minutes since midnight in the EXPERT's time zone.
// Every slot is converted to an absolute instant, so a customer anywhere sees
// the right moment in their own local time.
import type { AvailabilityDate, AvailabilityWindow } from '@/types/user';
import type { TimeSlot } from '@/types/booking';

export type BusyRange = { startIso: string; endIso: string };

export type SlotGenOptions = {
  /** Slot length in minutes (default 30). */
  slotMinutes?: number;
  /** How many days ahead to look (default 14). */
  daysAhead?: number;
  /** Earliest bookable start, in minutes from now (default 0). */
  minNoticeMinutes?: number;
  /** Minutes kept free before and after every taken time (default 0). */
  bufferMinutes?: number;
  /** IANA zone the windows are written in. Omitted = the viewer's zone. */
  timeZone?: string | null;
  /** Now, defaults to new Date(). */
  now?: Date;
};

export type GeneratedSlot = TimeSlot & {
  /** The viewer's local calendar date of the slot start, YYYY-MM-DD. */
  dateKey: string;
};

const pad = (n: number) => n.toString().padStart(2, '0');

const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The device's IANA time zone, or null when the runtime cannot tell. */
export const deviceTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

// Wall-clock parts of an instant in a zone. Returns null when the runtime
// lacks time zone data, so callers can fall back to local time.
const partsInZone = (instant: Date, timeZone: string): ZonedParts | null => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const out: Record<string, number> = {};
    for (const part of formatter.formatToParts(instant)) {
      if (part.type !== 'literal') out[part.type] = Number(part.value);
    }
    const { year, month, day, hour, minute } = out;
    if (
      year === undefined ||
      month === undefined ||
      day === undefined ||
      hour === undefined ||
      minute === undefined
    ) {
      return null;
    }
    return { year, month, day, hour: hour % 24, minute };
  } catch {
    return null;
  }
};

// The instant at which a zone's wall clock reads the given date + minutes.
// Two passes so the offset is right on either side of a daylight-saving change.
const zonedTimeToInstant = (
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date | null => {
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minutes);
  const offsetAt = (instantMs: number): number | null => {
    const p = partsInZone(new Date(instantMs), timeZone);
    if (!p) return null;
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instantMs;
  };
  const first = offsetAt(wallAsUtc);
  if (first === null) return null;
  const guess = wallAsUtc - first;
  const second = offsetAt(guess);
  if (second === null) return null;
  return new Date(wallAsUtc - second);
};

const overlaps = (aStart: Date, aEnd: Date, b: BusyRange): boolean =>
  aStart.getTime() < new Date(b.endIso).getTime() &&
  aEnd.getTime() > new Date(b.startIso).getTime();

type CalendarDay = { year: number; month: number; day: number; weekday: number; key: string };

// The next `count` calendar days as the expert's zone sees them.
const upcomingDays = (now: Date, count: number, timeZone: string | null): CalendarDay[] => {
  const zoned = timeZone ? partsInZone(now, timeZone) : null;
  const start = zoned
    ? { year: zoned.year, month: zoned.month, day: zoned.day }
    : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const days: CalendarDay[] = [];
  for (let i = 0; i < count; i++) {
    // Date.UTC normalises day overflow, so adding i rolls months and years.
    const d = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    days.push({ year, month, day, weekday: d.getUTCDay(), key: `${year}-${pad(month)}-${pad(day)}` });
  }
  return days;
};

export const generateSlots = (
  weekly: AvailabilityWindow[],
  specific: AvailabilityDate[],
  busy: BusyRange[],
  options: SlotGenOptions = {},
): GeneratedSlot[] => {
  const slotMinutes = options.slotMinutes ?? 30;
  const daysAhead = options.daysAhead ?? 14;
  const now = options.now ?? new Date();
  const earliest = now.getTime() + (options.minNoticeMinutes ?? 0) * 60_000;
  // Widen each taken time by the expert's gap so neighbours stay free.
  const gapMs = (options.bufferMinutes ?? 0) * 60_000;
  const taken: BusyRange[] =
    gapMs === 0
      ? busy
      : busy.map((b) => ({
          startIso: new Date(new Date(b.startIso).getTime() - gapMs).toISOString(),
          endIso: new Date(new Date(b.endIso).getTime() + gapMs).toISOString(),
        }));
  // Use the expert's zone only when this runtime can actually convert it.
  const timeZone =
    options.timeZone && partsInZone(now, options.timeZone) ? options.timeZone : null;

  const slots: GeneratedSlot[] = [];
  for (const day of upcomingDays(now, daysAhead, timeZone)) {
    const dated = specific.filter((s) => s.date === day.key);
    // A blocked row closes the whole day, whatever the weekly hours say.
    if (dated.some((s) => s.blocked)) continue;
    const windows = [...weekly.filter((w) => w.weekday === day.weekday), ...dated];

    for (const w of windows) {
      for (let m = w.startMinute; m + slotMinutes <= w.endMinute; m += slotMinutes) {
        const start = timeZone
          ? zonedTimeToInstant(day.year, day.month, day.day, m, timeZone)
          : new Date(day.year, day.month - 1, day.day, 0, m);
        if (!start) continue;
        const end = new Date(start.getTime() + slotMinutes * 60_000);
        if (start.getTime() <= earliest) continue;
        if (taken.some((b) => overlaps(start, end, b))) continue;
        slots.push({
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          dateKey: localDateKey(start),
        });
      }
    }
  }

  // Overlapping windows (weekly + an extra date) can produce the same start.
  const seen = new Set<string>();
  return slots
    .filter((s) => {
      if (seen.has(s.startIso)) return false;
      seen.add(s.startIso);
      return true;
    })
    .sort((a, b) => a.startIso.localeCompare(b.startIso));
};

export const groupSlotsByDate = (slots: GeneratedSlot[]): Record<string, GeneratedSlot[]> => {
  const map: Record<string, GeneratedSlot[]> = {};
  for (const s of slots) {
    (map[s.dateKey] ??= []).push(s);
  }
  return map;
};

/** Merge overlapping or touching windows on the same weekday and sort them. */
export const normalizeWindows = (windows: AvailabilityWindow[]): AvailabilityWindow[] => {
  const sorted = [...windows].sort((a, b) =>
    a.weekday !== b.weekday ? a.weekday - b.weekday : a.startMinute - b.startMinute,
  );
  const out: AvailabilityWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && last.weekday === w.weekday && w.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, w.endMinute);
    } else {
      out.push({ ...w });
    }
  }
  return out;
};
