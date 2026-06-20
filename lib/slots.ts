// Slot generation: given an expert's availability (weekly windows + specific
// dates) and existing bookings, produce concrete bookable time slots for a
// look-ahead horizon. Defaults to 30-minute slots, 14 days ahead.
import type {
  AvailabilityDate,
  AvailabilityWindow,
} from '@/types/user';
import type { Booking, TimeSlot } from '@/types/booking';

export type SlotGenOptions = {
  /** Slot length in minutes (default 30). */
  slotMinutes?: number;
  /** How many days ahead to look (default 14). */
  daysAhead?: number;
  /** Today, defaults to new Date(). */
  now?: Date;
};

export type GeneratedSlot = TimeSlot & { dateKey: string };

const startOfLocalDay = (d: Date): Date => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const isoDateKey = (d: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const overlaps = (aStart: Date, aEnd: Date, bStartIso: string, bEndIso: string): boolean => {
  const bStart = new Date(bStartIso).getTime();
  const bEnd = new Date(bEndIso).getTime();
  return aStart.getTime() < bEnd && aEnd.getTime() > bStart;
};

type Window = { startMinute: number; endMinute: number };

const windowsForDate = (
  date: Date,
  weekly: AvailabilityWindow[],
  specific: AvailabilityDate[],
): Window[] => {
  const dateKey = isoDateKey(date);
  const weeklyFor = weekly.filter((w) => w.weekday === date.getDay());
  const specificFor = specific.filter((s) => s.date === dateKey);
  // Union — both kinds contribute. We don't de-overlap here; downstream slot
  // generation already produces unique slot starts, and overlaps just mean a
  // slot can be reached by either rule.
  return [...weeklyFor, ...specificFor].map((w) => ({
    startMinute: w.startMinute,
    endMinute: w.endMinute,
  }));
};

export const generateSlots = (
  weekly: AvailabilityWindow[],
  specific: AvailabilityDate[],
  busy: Booking[],
  options: SlotGenOptions = {},
): GeneratedSlot[] => {
  const slotMinutes = options.slotMinutes ?? 30;
  const daysAhead = options.daysAhead ?? 14;
  const now = options.now ?? new Date();
  const slots: GeneratedSlot[] = [];
  const today = startOfLocalDay(now);

  // Busy bookings: anything that hasn't been cancelled or declined blocks the slot.
  const blockingStatuses = ['requested', 'confirmed', 'in_progress'] as const;
  const blockers = busy.filter((b) => (blockingStatuses as readonly string[]).includes(b.status));

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const day = new Date(today);
    day.setDate(day.getDate() + dayOffset);
    const dateKey = isoDateKey(day);
    const windows = windowsForDate(day, weekly, specific);

    for (const w of windows) {
      for (let m = w.startMinute; m + slotMinutes <= w.endMinute; m += slotMinutes) {
        const start = new Date(day);
        start.setHours(0, m, 0, 0);
        const end = new Date(start.getTime() + slotMinutes * 60_000);
        if (start.getTime() <= now.getTime()) continue;
        if (blockers.some((b) => overlaps(start, end, b.slot.startIso, b.slot.endIso))) continue;
        slots.push({
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          dateKey,
        });
      }
    }
  }

  // Dedupe — overlap between weekly + specific windows can produce the same start.
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
