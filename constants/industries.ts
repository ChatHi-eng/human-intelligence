export type Industry = {
  id: string;
  label: string;
  emoji: string;
  // Typical USD range for a 1:1 advice call in this field. Shown as guidance
  // on the application's rate step ("most X experts charge $A–$B/hr") — never
  // enforced; applicants can price above, below, or decide later.
  suggestedRateCents: { min: number; max: number };
};

export const industries: readonly Industry[] = [
  { id: 'artists', label: 'Artists', emoji: '🎨', suggestedRateCents: { min: 5000, max: 15000 } },
  { id: 'writers', label: 'Writers', emoji: '✍️', suggestedRateCents: { min: 5000, max: 15000 } },
  {
    id: 'product-designers',
    label: 'Product Designers',
    emoji: '🖌️',
    suggestedRateCents: { min: 10000, max: 25000 },
  },
  { id: 'coders', label: 'Coders', emoji: '💻', suggestedRateCents: { min: 10000, max: 25000 } },
  {
    id: 'engineers',
    label: 'Engineers',
    emoji: '🛠️',
    suggestedRateCents: { min: 10000, max: 25000 },
  },
  { id: 'lawyers', label: 'Lawyers', emoji: '⚖️', suggestedRateCents: { min: 25000, max: 50000 } },
  {
    id: 'therapists',
    label: 'Therapists',
    emoji: '🧠',
    suggestedRateCents: { min: 10000, max: 25000 },
  },
  {
    id: 'tradesmen',
    label: 'Tradesmen',
    emoji: '🔧',
    suggestedRateCents: { min: 7500, max: 15000 },
  },
] as const;

export const industryById = (id: string) => industries.find((i) => i.id === id);
