// Ordering and "when can I book them" for the Discover list.
import {
  BOOKING_WINDOW_DAYS,
  MIN_BOOKING_NOTICE_MINUTES,
  MIN_REVIEWS_FOR_RATING,
} from '@/constants/business';
import { generateSlots } from '@/lib/slots';
import type { Expert } from '@/types/user';

export type ExpertSort = 'soonest' | 'rating' | 'price';

/**
 * Start of the expert's next open time, or null when they have none or have
 * not set a rate (no rate means they cannot be booked). Built from their
 * published hours only; a time someone else just took is filtered out on the
 * booking screen, so the card shows the day, never an exact time.
 */
export const nextOpening = (expert: Expert, now: Date = new Date()): string | null => {
  if (expert.hourlyRate === null || expert.paused) return null;
  const slots = generateSlots(expert.availability, expert.availabilityDates, [], {
    timeZone: expert.timezone,
    minNoticeMinutes: MIN_BOOKING_NOTICE_MINUTES,
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
      return (a.hourlyRate ?? Infinity) - (b.hourlyRate ?? Infinity) || byRating(a, b);
    }
    const aOpen = opening.get(a.id);
    const bOpen = opening.get(b.id);
    if (aOpen && bOpen && aOpen !== bOpen) return aOpen.localeCompare(bOpen);
    return byRating(a, b);
  });
};
