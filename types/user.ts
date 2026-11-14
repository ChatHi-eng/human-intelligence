export type Role = 'customer' | 'expert';

export type Profile = {
  id: string;
  role: Role;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
};

export type Customer = Profile & {
  role: 'customer';
};

export type BackgroundType = 'work' | 'education' | 'certification' | 'other';

export type Credential = {
  id: string;
  title: string;
  issuer: string;
  year: number;
  endYear: number | null;
  type: BackgroundType;
};

export type AvailabilityWindow = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startMinute: number;
  endMinute: number;
};

export type AvailabilityDate = {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  startMinute: number;
  endMinute: number;
};

// Application review state. New expert applications start 'pending' and only
// 'approved' experts appear on Discover; the owner flips this in Supabase.
export type ExpertStatus = 'pending' | 'approved' | 'rejected';

export type Expert = Profile & {
  role: 'expert';
  status: ExpertStatus;
  linkedinUrl: string | null;
  industryId: string;
  // Their own field name when industryId is 'other'.
  industryCustom: string | null;
  // Current role, shown as "Title at Company".
  currentTitle: string | null;
  currentCompany: string | null;
  // Specific things they can be asked about.
  topics: string[];
  headline: string;
  // Cents. null = applicant chose "I'll decide later" — the app shows
  // "Rate coming soon" and booking stays off until they set one.
  hourlyRate: number | null;
  yearsExperience: number;
  ratingAverage: number;
  ratingCount: number;
  howICanHelp: string | null;
  credentials: Credential[];
  availability: AvailabilityWindow[];
  availabilityDates: AvailabilityDate[];
  verified: boolean;
  coverImageUrl: string;
  // Stripe Connect — set after expert starts onboarding. payoutsEnabled flips
  // true once Stripe says charges_enabled + payouts_enabled.
  stripeConnectAccountId: string | null;
  stripeConnectPayoutsEnabled: boolean;
};

export const isExpert = (p: Profile): p is Expert => p.role === 'expert';
