// Ordering, matching and "when can I book them" for Discover.
import {
  APPROVAL_BOOKING_NOTICE_MINUTES,
  BOOKING_WINDOW_DAYS,
  MIN_BOOKING_NOTICE_MINUTES,
  MIN_REVIEWS_FOR_RATING,
} from '@/constants/business';
import { industryDisplay } from '@/constants/industries';
import { generateSlots } from '@/lib/slots';
import type { Expert } from '@/types/user';

export type ExpertSort = 'recommended' | 'soonest' | 'rating' | 'price';

const DAY_MS = 24 * 60 * 60_000;

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
 * Start of the expert's next open time, or null when they have none, are
 * paused, or have not set a price (no price means they cannot be booked).
 * Built from their published hours only; a time someone else just took is
 * filtered out on the booking screen, so cards show the day, never a time.
 */
export const nextOpening = (expert: Expert, now: Date = new Date()): string | null => {
  if (expert.sessionPrice === null || expert.paused) return null;
  const slots = generateSlots(sessionWindows(expert), expert.availabilityDates, [], {
    timeZone: expert.timezone,
    bufferMinutes: expert.bufferMinutes,
    minNoticeMinutes: noticeMinutesFor(expert),
    daysAhead: BOOKING_WINDOW_DAYS,
    now,
  });
  return slots[0]?.startIso ?? null;
};

/** "Next: today", "Next: tomorrow", "Next: Tue, in 3 days". */
export const openingLabel = (openingIso: string, now: Date = new Date()): string => {
  const opening = new Date(openingIso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(opening) - startOf(now)) / DAY_MS);
  if (days <= 0) return 'Next: today';
  if (days === 1) return 'Next: tomorrow';
  const weekday = opening.toLocaleDateString(undefined, { weekday: 'short' });
  return `Next: ${weekday}, in ${days} days`;
};

/** Experts who can be booked within the next `days` days, soonest first. */
export const availableWithin = (experts: Expert[], days: number, now: Date = new Date()): Expert[] =>
  experts
    .map((expert) => ({ expert, opening: nextOpening(expert, now) }))
    .filter(
      (x): x is { expert: Expert; opening: string } =>
        x.opening !== null && Date.parse(x.opening) - now.getTime() <= days * DAY_MS,
    )
    .sort((a, b) => a.opening.localeCompare(b.opening))
    .map((x) => x.expert);

// How filled-in a profile is. Used only to order otherwise-equal experts.
const completeness = (e: Expert): number =>
  (e.avatarUrl ? 1 : 0) +
  (e.howICanHelp ? 1 : 0) +
  (e.topics.length > 0 ? 1 : 0) +
  (e.credentials.length > 0 ? 1 : 0) +
  (e.verified ? 1 : 0);

// A number that is stable for one expert on one day and different the next,
// so equally good experts take turns at the top instead of one always winning.
const dailyRotation = (id: string, now: Date): number => {
  const seed = `${id}:${Math.floor(now.getTime() / DAY_MS)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
};

export const sortExperts = (experts: Expert[], sort: ExpertSort, now: Date = new Date()): Expert[] => {
  const opening = new Map(experts.map((e) => [e.id, nextOpening(e, now)]));
  const bookable = (e: Expert) => (opening.get(e.id) ? 0 : 1);
  // An average built on a handful of reviews does not outrank anyone.
  const rated = (e: Expert) => (e.ratingCount >= MIN_REVIEWS_FOR_RATING ? e.ratingAverage : 0);
  const byRating = (a: Expert, b: Expert) => rated(b) - rated(a) || b.ratingCount - a.ratingCount;

  return [...experts].sort((a, b) => {
    // People who can actually be booked always come before those who cannot.
    if (bookable(a) !== bookable(b)) return bookable(a) - bookable(b);
    if (sort === 'rating') return byRating(a, b);
    if (sort === 'price') {
      return (a.sessionPrice ?? Infinity) - (b.sessionPrice ?? Infinity) || byRating(a, b);
    }
    if (sort === 'soonest') {
      const aOpen = opening.get(a.id);
      const bOpen = opening.get(b.id);
      if (aOpen && bOpen && aOpen !== bOpen) return aOpen.localeCompare(bOpen);
      return byRating(a, b);
    }
    // Recommended: fuller profiles first, then a daily rotation.
    return (
      completeness(b) - completeness(a) ||
      byRating(a, b) ||
      dailyRotation(a.id, now) - dailyRotation(b.id, now)
    );
  });
};

/** The topics experts in a field list, most common first. */
export const topicsForField = (experts: Expert[], fieldId: string, limit = 8): string[] => {
  const counts = new Map<string, { label: string; n: number }>();
  for (const e of experts) {
    if (e.industryId !== fieldId) continue;
    for (const topic of e.topics) {
      const key = topic.trim().toLowerCase();
      if (!key) continue;
      const seen = counts.get(key);
      if (seen) seen.n += 1;
      else counts.set(key, { label: topic.trim(), n: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((t) => t.label);
};

export type ExpertMatch = { expert: Expert; reason: string };

/**
 * Up to three experts for a need: a field, and optionally one topic in it.
 * Experts who list the topic come first, then anyone whose profile mentions
 * it, then the rest of the field as closest matches. Each comes with one
 * plain reason a customer can check against the profile.
 */
export const matchExperts = (
  experts: Expert[],
  fieldId: string,
  topic: string | null,
  now: Date = new Date(),
): ExpertMatch[] => {
  const field = experts.filter((e) => e.industryId === fieldId);
  const needle = topic?.trim().toLowerCase() ?? '';
  const fieldLabel = (e: Expert) =>
    industryDisplay(e.industryId, e.industryCustom)?.label ?? 'this field';

  const scored = field.map((expert) => {
    const listed = needle ? expert.topics.find((t) => t.trim().toLowerCase() === needle) : undefined;
    const mentioned =
      Boolean(needle) &&
      `${expert.headline} ${expert.howICanHelp ?? ''} ${expert.currentTitle ?? ''}`
        .toLowerCase()
        .includes(needle);
    const score = listed ? 2 : mentioned ? 1 : 0;
    const reason = listed
      ? `Lists "${listed}" as something to ask about`
      : mentioned
        ? `Mentions ${topic} in their profile`
        : `${expert.yearsExperience} years in ${fieldLabel(expert)}`;
    return { expert, reason, score, opening: nextOpening(expert, now) };
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.opening ? 0 : 1) - (b.opening ? 0 : 1) ||
        (a.opening ?? '').localeCompare(b.opening ?? '') ||
        completeness(b.expert) - completeness(a.expert),
    )
    .slice(0, 3)
    .map(({ expert, reason }) => ({ expert, reason }));
};
