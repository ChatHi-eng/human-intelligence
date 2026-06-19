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

export type Credential = {
  id: string;
  title: string;
  issuer: string;
  year: number;
};

export type Expert = Profile & {
  role: 'expert';
  industryId: string;
  headline: string;
  hourlyRate: number;
  yearsExperience: number;
  ratingAverage: number;
  ratingCount: number;
  credentials: Credential[];
  availability: AvailabilityWindow[];
  verified: boolean;
  coverImageUrl: string;
};

export type AvailabilityWindow = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startMinute: number;
  endMinute: number;
};

export const isExpert = (p: Profile): p is Expert => p.role === 'expert';
