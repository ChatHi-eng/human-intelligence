import type { IconName } from '@/components/ui/Icon';

export type Industry = {
  id: string;
  label: string;
  // A Feather line icon name (see components/ui/Icon).
  icon: IconName;
  // Typical USD price of one 30-minute session in this field. Shown as
  // guidance on the application's price step, never enforced; applicants can
  // price above, below, or decide later.
  suggestedPriceCents: { min: number; max: number };
};

// Applicants whose field isn't listed pick this and type their own
// (stored in expert_profiles.industry_custom).
export const OTHER_INDUSTRY_ID = 'other';

// The figures below are written as hourly advice-call rates, which is how
// people in these fields quote. A Palam session is 30 minutes, so the guide
// price is half: rate(250, 500) means $125 to $250 per session.
const rate = (minHourly: number, maxHourly: number) => ({
  min: minHourly * 50,
  max: maxHourly * 50,
});

// The first eight ids predate the expanded list. Keep them stable: existing
// expert rows and Discover filters reference them.
export const industries: readonly Industry[] = [
  { id: 'lawyers', label: 'Law', icon: 'briefcase', suggestedPriceCents: rate(250, 500) },
  { id: 'therapists', label: 'Therapy & Mental Health', icon: 'heart', suggestedPriceCents: rate(100, 250) },
  { id: 'coders', label: 'Software Engineering', icon: 'code', suggestedPriceCents: rate(100, 250) },
  { id: 'product-designers', label: 'Product & UX Design', icon: 'pen-tool', suggestedPriceCents: rate(100, 250) },
  { id: 'engineers', label: 'Engineering', icon: 'settings', suggestedPriceCents: rate(100, 250) },
  { id: 'tradesmen', label: 'Skilled Trades', icon: 'tool', suggestedPriceCents: rate(75, 150) },
  { id: 'writers', label: 'Writing & Editing', icon: 'edit-3', suggestedPriceCents: rate(50, 150) },
  { id: 'artists', label: 'Art & Illustration', icon: 'feather', suggestedPriceCents: rate(50, 150) },
  { id: 'product-management', label: 'Product Management', icon: 'compass', suggestedPriceCents: rate(125, 300) },
  { id: 'startups', label: 'Startups & Founding', icon: 'zap', suggestedPriceCents: rate(150, 400) },
  { id: 'marketing', label: 'Marketing & Growth', icon: 'volume-2', suggestedPriceCents: rate(100, 250) },
  { id: 'sales', label: 'Sales', icon: 'tag', suggestedPriceCents: rate(100, 250) },
  { id: 'finance', label: 'Finance & Investing', icon: 'trending-up', suggestedPriceCents: rate(150, 400) },
  { id: 'accounting', label: 'Accounting & Tax', icon: 'file-text', suggestedPriceCents: rate(125, 300) },
  { id: 'real-estate', label: 'Real Estate', icon: 'home', suggestedPriceCents: rate(100, 250) },
  { id: 'medicine', label: 'Medicine & Health', icon: 'activity', suggestedPriceCents: rate(200, 450) },
  { id: 'nutrition-fitness', label: 'Nutrition & Fitness', icon: 'droplet', suggestedPriceCents: rate(60, 150) },
  { id: 'career', label: 'Career & Job Search', icon: 'user-check', suggestedPriceCents: rate(75, 200) },
  { id: 'leadership', label: 'Leadership & Management', icon: 'flag', suggestedPriceCents: rate(150, 350) },
  { id: 'hr', label: 'HR & Recruiting', icon: 'users', suggestedPriceCents: rate(100, 225) },
  { id: 'data-ai', label: 'Data & AI', icon: 'bar-chart-2', suggestedPriceCents: rate(125, 300) },
  { id: 'operations', label: 'Operations & Logistics', icon: 'truck', suggestedPriceCents: rate(100, 250) },
  { id: 'education', label: 'Teaching & Education', icon: 'book-open', suggestedPriceCents: rate(60, 150) },
  { id: 'architecture', label: 'Architecture & Interiors', icon: 'layout', suggestedPriceCents: rate(100, 250) },
  { id: 'film-photo', label: 'Film & Photography', icon: 'film', suggestedPriceCents: rate(75, 200) },
  { id: 'music', label: 'Music & Audio', icon: 'music', suggestedPriceCents: rate(60, 175) },
  { id: 'food', label: 'Food & Hospitality', icon: 'coffee', suggestedPriceCents: rate(60, 175) },
  { id: 'parenting', label: 'Parenting & Family', icon: 'smile', suggestedPriceCents: rate(60, 150) },
  { id: 'immigration', label: 'Immigration & Relocation', icon: 'globe', suggestedPriceCents: rate(100, 300) },
  { id: 'nonprofit', label: 'Nonprofit & Public Sector', icon: 'gift', suggestedPriceCents: rate(75, 200) },
] as const;

export const industryById = (id: string) => industries.find((i) => i.id === id);

// What to show for an expert's field anywhere in the UI: the listed industry,
// or their own typed field when they chose "Something else".
export const industryDisplay = (
  industryId: string,
  custom?: string | null,
): { icon: IconName; label: string } | null => {
  const listed = industryById(industryId);
  if (listed) return { icon: listed.icon, label: listed.label };
  const typed = custom?.trim();
  return typed ? { icon: 'plus-circle', label: typed } : null;
};
