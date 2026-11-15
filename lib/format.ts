// Whole amounts read as "$75"; anything with cents shows them ("$76.50").
// Money is never rounded for display: a price of $87.50 must not read "$88".
export const formatCurrency = (cents: number, currency = 'USD') => {
  const digits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
};

export const formatRating = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
