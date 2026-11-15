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

// 'session' hours are for paid 30-minute sessions; 'intro' hours are for
// free 15-minute intro calls.
export type AvailabilityKind = 'session' | 'intro';

export type AvailabilityWindow = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startMinute: number;
  endMinute: number;
  kind: AvailabilityKind;
};

export type AvailabilityDate = {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  startMinute: number;
  endMinute: number;
  // true = the expert is off that whole day; the hours are ignored.
  blocked: boolean;
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
  sessionPrice: number | null;
  yearsExperience: number;
  ratingAverage: number;
  ratingCount: number;
  howICanHelp: string | null;
  credentials: Credential[];
  availability: AvailabilityWindow[];
  availabilityDates: AvailabilityDate[];
  // IANA zone the availability hours are written in. null = not set yet.
  timezone: string | null;
  // true = customers are confirmed as soon as they pay. false = the expert
  // approves each request and the card is only held until they do.
  autoAccept: boolean;
  // Offers a free 15-minute intro call in their intro hours, up to
  // introWeeklyLimit a week, one per customer.
  introEnabled: boolean;
  introWeeklyLimit: number;
  // Hidden from Discover and not bookable while true; hours are kept.
  paused: boolean;
  // Minutes kept free on either side of each booked session.
  bufferMinutes: number;
  verified: boolean;
  coverImageUrl: string;
  // Stripe Connect — set after expert starts onboarding. payoutsEnabled flips
  // true once Stripe says charges_enabled + payouts_enabled.
  stripeConnectAccountId: string | null;
  stripeConnectPayoutsEnabled: boolean;
};

export const isExpert = (p: Profile): p is Expert => p.role === 'expert';
