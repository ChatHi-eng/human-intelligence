export type Industry = {
  id: string;
  label: string;
  emoji: string;
};

export const industries: readonly Industry[] = [
  { id: 'artists', label: 'Artists', emoji: '🎨' },
  { id: 'writers', label: 'Writers', emoji: '✍️' },
  { id: 'product-designers', label: 'Product Designers', emoji: '🖌️' },
  { id: 'coders', label: 'Coders', emoji: '💻' },
  { id: 'engineers', label: 'Engineers', emoji: '🛠️' },
  { id: 'lawyers', label: 'Lawyers', emoji: '⚖️' },
  { id: 'therapists', label: 'Therapists', emoji: '🧠' },
  { id: 'tradesmen', label: 'Tradesmen', emoji: '🔧' },
] as const;

export const industryById = (id: string) => industries.find((i) => i.id === id);
