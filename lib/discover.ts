// Ordering and "when can I book them" for the Discover list.
import {
  APPROVAL_BOOKING_NOTICE_MINUTES,
  BOOKING_WINDOW_DAYS,
  MIN_BOOKING_NOTICE_MINUTES,
  MIN_REVIEWS_FOR_RATING,
} from '@/constants/business';
import { generateSlots } from '@/lib/slots';
import type { Expert } from '@/types/user';

export type ExpertSort = 'soonest' | 'rating' | 'price';

/** Weekly hours for paid sessions (free-intro hours are kept apart). */
export const sessionWindows = (expert: Pick<Expert, 'availability'>) =>
  expert.availability.filter((w) => w.kind === 'session');

/** Weekly hours the expert set aside for free intro calls. */
export const introWindows = (expert: Pick<Expert, 'availability'>) =>
  expert.availability.filter((w) => w.kind === 'intro');

/** How far ahead this expert's times start being offered. */
export const noticeMinutesFor = (expert: Pick<Expert, 'autoAccept'>): number =>
  expert.autoAccept ? MIN_BOOKING_NOTICE_MINUTES : APPROVAL_BOOKING_NOTICE_MINUTES;

/**
 * Start of the expert's next open time, or null when they have none or have
 * not set a rate (no rate means they cannot be booked). Built from their
 * published hours only; a time someone else just took is filtered out on the
 * booking screen, so the card shows the day, never an exact time.
 */
export const nextOpening = (expert: Expert, now: Date = new Date()): string | null => {
  if (expert.sessionPrice === null || expert.paused) return null;
  const slots = generateSlots(sessionWindows(expert), expert.availabilityDates, [], {
    timeZone: expert.timezone,
    minNoticeMinutes: noticeMinutesFor(expert),
    daysAhead: BOOKING_WINDOW_DAYS,
    now,
  });
  return slots[0]?.startIso ?? null;
};

export const sortExperts = (experts: Expert[], sort: ExpertSort, now: Date = new Date()): Expert[] => {
  const opening = new Map(experts.map((e) => [e.id, nextOpening(e, now)]));
  const bookable = (e: Expert) => (opening.get(e.id) ? 0 : 1);
  // An average built on a handful of reviews does not outrank anyone.
  const rated = (e: Expert) => (e.ratingCount >= MIN_REVIEWS_FOR_RATING ? e.ratingAverage : 0);
  const byRating = (a: Expert, b: Expert) =>
    rated(b) - rated(a) || b.ratingCount - a.ratingCount;

  return [...experts].sort((a, b) => {
    // People who can actually be booked always come before those who cannot.
    if (bookable(a) !== bookable(b)) return bookable(a) - bookable(b);
    if (sort === 'rating') return byRating(a, b);
    if (sort === 'price') {
      return (a.sessionPrice ?? Infinity) - (b.sessionPrice ?? Infinity) || byRating(a, b);
    }
    const aOpen = opening.get(a.id);
    const bOpen = opening.get(b.id);
    if (aOpen && bOpen && aOpen !== bOpen) return aOpen.localeCompare(bOpen);
    return byRating(a, b);
  });
};
