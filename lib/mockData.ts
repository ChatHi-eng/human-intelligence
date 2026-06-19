import type { Booking, EarningsBucket } from '@/types/booking';
import type { Expert } from '@/types/user';
import type { Review } from '@/types/review';
import { addMinutes } from '@/lib/date';

const now = new Date();
const inHours = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

export const mockExperts: Expert[] = [
  {
    id: 'exp_1',
    role: 'expert',
    displayName: 'Maya Okafor',
    avatarUrl: 'https://i.pravatar.cc/300?img=47',
    coverImageUrl: 'https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=1200',
    bio: 'Constitutional lawyer focused on tenant rights and small-business disputes.',
    industryId: 'lawyers',
    headline: 'Tenant & small-business law, plain English',
    hourlyRate: 18000,
    yearsExperience: 12,
    ratingAverage: 4.9,
    ratingCount: 184,
    credentials: [
      { id: 'c1', title: 'JD', issuer: 'Columbia Law', year: 2013 },
      { id: 'c2', title: 'NY Bar', issuer: 'State of New York', year: 2014 },
    ],
    availability: [
      { weekday: 1, startMinute: 540, endMinute: 1020 },
      { weekday: 3, startMinute: 540, endMinute: 1020 },
    ],
    verified: true,
    createdAt: daysAgo(900),
  },
  {
    id: 'exp_2',
    role: 'expert',
    displayName: 'Jonas Hartwell',
    avatarUrl: 'https://i.pravatar.cc/300?img=12',
    coverImageUrl: 'https://images.unsplash.com/photo-1517512006864-7edc3b933137?w=1200',
    bio: 'Senior staff engineer, 15+ years across infra and platform.',
    industryId: 'coders',
    headline: 'System design & code review for senior+ ICs',
    hourlyRate: 22000,
    yearsExperience: 15,
    ratingAverage: 4.8,
    ratingCount: 312,
    credentials: [
      { id: 'c1', title: 'MS Computer Science', issuer: 'CMU', year: 2010 },
      { id: 'c2', title: 'Staff Engineer', issuer: 'Stripe (alum)', year: 2021 },
    ],
    availability: [
      { weekday: 2, startMinute: 600, endMinute: 1080 },
      { weekday: 4, startMinute: 600, endMinute: 1080 },
    ],
    verified: true,
    createdAt: daysAgo(540),
  },
  {
    id: 'exp_3',
    role: 'expert',
    displayName: 'Dr. Priya Raman',
    avatarUrl: 'https://i.pravatar.cc/300?img=32',
    coverImageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1200',
    bio: 'Licensed clinical therapist. CBT, anxiety, career transitions.',
    industryId: 'therapists',
    headline: 'CBT for anxiety & career change',
    hourlyRate: 16000,
    yearsExperience: 9,
    ratingAverage: 4.95,
    ratingCount: 421,
    credentials: [
      { id: 'c1', title: 'PsyD', issuer: 'Berkeley', year: 2016 },
      { id: 'c2', title: 'LCSW', issuer: 'State of CA', year: 2017 },
    ],
    availability: [{ weekday: 5, startMinute: 480, endMinute: 1020 }],
    verified: true,
    createdAt: daysAgo(720),
  },
  {
    id: 'exp_4',
    role: 'expert',
    displayName: 'Ben Carrillo',
    avatarUrl: 'https://i.pravatar.cc/300?img=15',
    coverImageUrl: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200',
    bio: 'Master electrician, 20 years. Residential rewires & code consults.',
    industryId: 'tradesmen',
    headline: 'Residential electrical, permit & code help',
    hourlyRate: 9000,
    yearsExperience: 20,
    ratingAverage: 4.7,
    ratingCount: 96,
    credentials: [{ id: 'c1', title: 'Master Electrician', issuer: 'State of TX', year: 2008 }],
    availability: [
      { weekday: 0, startMinute: 540, endMinute: 1020 },
      { weekday: 6, startMinute: 540, endMinute: 1020 },
    ],
    verified: false,
    createdAt: daysAgo(220),
  },
  {
    id: 'exp_5',
    role: 'expert',
    displayName: 'Lina Sørensen',
    avatarUrl: 'https://i.pravatar.cc/300?img=44',
    coverImageUrl: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=1200',
    bio: 'Product designer focusing on B2B SaaS and design systems.',
    industryId: 'product-designers',
    headline: 'Portfolio reviews and design system audits',
    hourlyRate: 14000,
    yearsExperience: 8,
    ratingAverage: 4.85,
    ratingCount: 167,
    credentials: [{ id: 'c1', title: 'BFA Industrial Design', issuer: 'RISD', year: 2017 }],
    availability: [{ weekday: 3, startMinute: 600, endMinute: 1080 }],
    verified: true,
    createdAt: daysAgo(410),
  },
];

export const mockBookings: Booking[] = [
  {
    id: 'bk_1',
    customerId: 'cust_self',
    expertId: 'exp_1',
    slot: { startIso: inHours(28), endIso: addMinutes(inHours(28), 30) },
    medium: 'video',
    status: 'confirmed',
    paymentStatus: 'authorized',
    priceCents: 9000,
    callRoomUrl: null,
    createdAt: daysAgo(1),
  },
  {
    id: 'bk_2',
    customerId: 'cust_self',
    expertId: 'exp_2',
    slot: { startIso: inHours(2), endIso: addMinutes(inHours(2), 45) },
    medium: 'video',
    status: 'confirmed',
    paymentStatus: 'authorized',
    priceCents: 16500,
    callRoomUrl: null,
    createdAt: daysAgo(3),
  },
  {
    id: 'bk_3',
    customerId: 'cust_self',
    expertId: 'exp_3',
    slot: { startIso: daysAgo(4), endIso: addMinutes(daysAgo(4), 60) },
    medium: 'phone',
    status: 'completed',
    paymentStatus: 'captured',
    priceCents: 16000,
    callRoomUrl: null,
    createdAt: daysAgo(10),
  },
];

export const mockReviews: Review[] = [
  {
    id: 'rev_1',
    bookingId: 'bk_3',
    customerId: 'cust_self',
    expertId: 'exp_3',
    rating: 5,
    comment: 'Hugely helpful — concrete tools I started using the next day.',
    createdAt: daysAgo(3),
  },
];

export const mockEarnings: EarningsBucket[] = [
  {
    periodLabel: 'Today',
    startIso: daysAgo(0),
    endIso: inHours(0),
    grossCents: 36000,
    payoutCents: 30600,
    bookingCount: 2,
  },
  {
    periodLabel: 'This week',
    startIso: daysAgo(6),
    endIso: inHours(0),
    grossCents: 184000,
    payoutCents: 156400,
    bookingCount: 11,
  },
  {
    periodLabel: 'This month',
    startIso: daysAgo(28),
    endIso: inHours(0),
    grossCents: 612000,
    payoutCents: 520200,
    bookingCount: 38,
  },
];

export const mockDailyEarningsCents: number[] = [
  12000, 8000, 18000, 22000, 14000, 0, 6000, 24000, 30000, 12000, 18000, 8000, 26000, 22000,
];
