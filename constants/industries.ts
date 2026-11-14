export type Industry = {
  id: string;
  label: string;
  emoji: string;
  // Typical USD range for a 1:1 advice call in this field. Shown as guidance
  // on the application's rate step ("most X charge $A to $B/hr"), never
  // enforced; applicants can price above, below, or decide later.
  suggestedRateCents: { min: number; max: number };
};

// Applicants whose field isn't listed pick this and type their own
// (stored in expert_profiles.industry_custom).
export const OTHER_INDUSTRY_ID = 'other';

const rate = (min: number, max: number) => ({ min: min * 100, max: max * 100 });

// The first eight ids predate the expanded list. Keep them stable: existing
// expert rows and Discover filters reference them.
export const industries: readonly Industry[] = [
  { id: 'lawyers', label: 'Law', emoji: '⚖️', suggestedRateCents: rate(250, 500) },
  { id: 'therapists', label: 'Therapy & Mental Health', emoji: '🧠', suggestedRateCents: rate(100, 250) },
  { id: 'coders', label: 'Software Engineering', emoji: '💻', suggestedRateCents: rate(100, 250) },
  { id: 'product-designers', label: 'Product & UX Design', emoji: '🖌️', suggestedRateCents: rate(100, 250) },
  { id: 'engineers', label: 'Engineering', emoji: '🛠️', suggestedRateCents: rate(100, 250) },
  { id: 'tradesmen', label: 'Skilled Trades', emoji: '🔧', suggestedRateCents: rate(75, 150) },
  { id: 'writers', label: 'Writing & Editing', emoji: '✍️', suggestedRateCents: rate(50, 150) },
  { id: 'artists', label: 'Art & Illustration', emoji: '🎨', suggestedRateCents: rate(50, 150) },
  { id: 'product-management', label: 'Product Management', emoji: '🧭', suggestedRateCents: rate(125, 300) },
  { id: 'startups', label: 'Startups & Founding', emoji: '🚀', suggestedRateCents: rate(150, 400) },
  { id: 'marketing', label: 'Marketing & Growth', emoji: '📣', suggestedRateCents: rate(100, 250) },
  { id: 'sales', label: 'Sales', emoji: '🤝', suggestedRateCents: rate(100, 250) },
  { id: 'finance', label: 'Finance & Investing', emoji: '📈', suggestedRateCents: rate(150, 400) },
  { id: 'accounting', label: 'Accounting & Tax', emoji: '🧾', suggestedRateCents: rate(125, 300) },
  { id: 'real-estate', label: 'Real Estate', emoji: '🏠', suggestedRateCents: rate(100, 250) },
  { id: 'medicine', label: 'Medicine & Health', emoji: '🩺', suggestedRateCents: rate(200, 450) },
  { id: 'nutrition-fitness', label: 'Nutrition & Fitness', emoji: '🥗', suggestedRateCents: rate(60, 150) },
  { id: 'career', label: 'Career & Job Search', emoji: '🧑‍💼', suggestedRateCents: rate(75, 200) },
  { id: 'leadership', label: 'Leadership & Management', emoji: '🪜', suggestedRateCents: rate(150, 350) },
  { id: 'hr', label: 'HR & Recruiting', emoji: '👥', suggestedRateCents: rate(100, 225) },
  { id: 'data-ai', label: 'Data & AI', emoji: '📊', suggestedRateCents: rate(125, 300) },
  { id: 'operations', label: 'Operations & Logistics', emoji: '🚚', suggestedRateCents: rate(100, 250) },
  { id: 'education', label: 'Teaching & Education', emoji: '🎓', suggestedRateCents: rate(60, 150) },
  { id: 'architecture', label: 'Architecture & Interiors', emoji: '📐', suggestedRateCents: rate(100, 250) },
  { id: 'film-photo', label: 'Film & Photography', emoji: '🎬', suggestedRateCents: rate(75, 200) },
  { id: 'music', label: 'Music & Audio', emoji: '🎵', suggestedRateCents: rate(60, 175) },
  { id: 'food', label: 'Food & Hospitality', emoji: '🍳', suggestedRateCents: rate(60, 175) },
  { id: 'parenting', label: 'Parenting & Family', emoji: '🧸', suggestedRateCents: rate(60, 150) },
  { id: 'immigration', label: 'Immigration & Relocation', emoji: '🌍', suggestedRateCents: rate(100, 300) },
  { id: 'nonprofit', label: 'Nonprofit & Public Sector', emoji: '🏛️', suggestedRateCents: rate(75, 200) },
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
