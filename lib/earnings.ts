import type { Booking, EarningsBucket, PaymentStatus } from '@/types/booking';

const EARNED_STATUSES: PaymentStatus[] = ['authorized', 'captured'];
const PLATFORM_FEE = 0.15;

const payoutOf = (grossCents: number) =>
  Math.floor(grossCents * (1 - PLATFORM_FEE));

const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const computeEarningsBuckets = (bookings: Booking[]): EarningsBucket[] => {
  const now = new Date();
  const today = startOfDay(now);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const earned = bookings.filter((b) => EARNED_STATUSES.includes(b.paymentStatus));

  const bucket = (label: string, since: Date): EarningsBucket => {
    const items = earned.filter((b) => new Date(b.slot.startIso) >= since);
    const gross = items.reduce((sum, b) => sum + b.priceCents, 0);
    return {
      periodLabel: label,
      startIso: since.toISOString(),
      endIso: now.toISOString(),
      grossCents: gross,
      payoutCents: payoutOf(gross),
      bookingCount: items.length,
    };
  };

  return [
    bucket('Today', today),
    bucket('This week', startOfWeek),
    bucket('This month', startOfMonth),
  ];
};

export const computeDailyEarningsSeries = (bookings: Booking[], days: number): number[] => {
  const today = startOfDay(new Date()).getTime();
  const result = new Array(days).fill(0) as number[];
  bookings
    .filter((b) => EARNED_STATUSES.includes(b.paymentStatus))
    .forEach((b) => {
      const day = startOfDay(new Date(b.slot.startIso)).getTime();
      const daysAgo = Math.floor((today - day) / 86_400_000);
      if (daysAgo >= 0 && daysAgo < days) {
        const idx = days - 1 - daysAgo;
        result[idx] = (result[idx] ?? 0) + b.priceCents;
      }
    });
  return result;
};
