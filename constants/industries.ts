export type Industry = {
  id: string;
  label: string;
  emoji: string;
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
  { id: 'lawyers', label: 'Law', emoji: '⚖️', suggestedPriceCents: rate(250, 500) },
  { id: 'therapists', label: 'Therapy & Mental Health', emoji: '🧠', suggestedPriceCents: rate(100, 250) },
  { id: 'coders', label: 'Software Engineering', emoji: '💻', suggestedPriceCents: rate(100, 250) },
  { id: 'product-designers', label: 'Product & UX Design', emoji: '🖌️', suggestedPriceCents: rate(100, 250) },
  { id: 'engineers', label: 'Engineering', emoji: '🛠️', suggestedPriceCents: rate(100, 250) },
  { id: 'tradesmen', label: 'Skilled Trades', emoji: '🔧', suggestedPriceCents: rate(75, 150) },
  { id: 'writers', label: 'Writing & Editing', emoji: '✍️', suggestedPriceCents: rate(50, 150) },
  { id: 'artists', label: 'Art & Illustration', emoji: '🎨', suggestedPriceCents: rate(50, 150) },
  { id: 'product-management', label: 'Product Management', emoji: '🧭', suggestedPriceCents: rate(125, 300) },
  { id: 'startups', label: 'Startups & Founding', emoji: '🚀', suggestedPriceCents: rate(150, 400) },
  { id: 'marketing', label: 'Marketing & Growth', emoji: '📣', suggestedPriceCents: rate(100, 250) },
  { id: 'sales', label: 'Sales', emoji: '🤝', suggestedPriceCents: rate(100, 250) },
  { id: 'finance', label: 'Finance & Investing', emoji: '📈', suggestedPriceCents: rate(150, 400) },
  { id: 'accounting', label: 'Accounting & Tax', emoji: '🧾', suggestedPriceCents: rate(125, 300) },
  { id: 'real-estate', label: 'Real Estate', emoji: '🏠', suggestedPriceCents: rate(100, 250) },
  { id: 'medicine', label: 'Medicine & Health', emoji: '🩺', suggestedPriceCents: rate(200, 450) },
  { id: 'nutrition-fitness', label: 'Nutrition & Fitness', emoji: '🥗', suggestedPriceCents: rate(60, 150) },
  { id: 'career', label: 'Career & Job Search', emoji: '🧑‍💼', suggestedPriceCents: rate(75, 200) },
  { id: 'leadership', label: 'Leadership & Management', emoji: '🪜', suggestedPriceCents: rate(150, 350) },
  { id: 'hr', label: 'HR & Recruiting', emoji: '👥', suggestedPriceCents: rate(100, 225) },
  { id: 'data-ai', label: 'Data & AI', emoji: '📊', suggestedPriceCents: rate(125, 300) },
  { id: 'operations', label: 'Operations & Logistics', emoji: '🚚', suggestedPriceCents: rate(100, 250) },
  { id: 'education', label: 'Teaching & Education', emoji: '🎓', suggestedPriceCents: rate(60, 150) },
  { id: 'architecture', label: 'Architecture & Interiors', emoji: '📐', suggestedPriceCents: rate(100, 250) },
  { id: 'film-photo', label: 'Film & Photography', emoji: '🎬', suggestedPriceCents: rate(75, 200) },
  { id: 'music', label: 'Music & Audio', emoji: '🎵', suggestedPriceCents: rate(60, 175) },
  { id: 'food', label: 'Food & Hospitality', emoji: '🍳', suggestedPriceCents: rate(60, 175) },
  { id: 'parenting', label: 'Parenting & Family', emoji: '🧸', suggestedPriceCents: rate(60, 150) },
  { id: 'immigration', label: 'Immigration & Relocation', emoji: '🌍', suggestedPriceCents: rate(100, 300) },
  { id: 'nonprofit', label: 'Nonprofit & Public Sector', emoji: '🏛️', suggestedPriceCents: rate(75, 200) },
] as const;

export const industryById = (id: string) => industries.find((i) => i.id === id);

// What to show for an expert's field anywhere in the UI: the listed industry,
// or their own typed field when they chose "Something else".
export const industryDisplay = (
  industryId: string,
  custom?: string | null,
): { emoji: string; label: string } | null => {
  const listed = industryById(industryId);
  if (listed) return { emoji: listed.emoji, label: listed.label };
  const typed = custom?.trim();
  return typed ? { emoji: '✨', label: typed } : null;
};
