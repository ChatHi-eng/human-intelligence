// Application-level data API. UI talks to hooks; hooks call functions here;
// these functions are the only place that knows about the Supabase row shape.
// If we ever swap the backend, only this file changes.
import { getSupabase } from './supabase';
import type {
  AvailabilityDate,
  AvailabilityWindow,
  BackgroundType,
  Credential,
  Expert,
  Profile,
} from '@/types/user';
import type {
  Booking,
  BookingStatus,
  CallMedium,
  PaymentStatus,
  TimeSlot,
} from '@/types/booking';
import type { Review } from '@/types/review';

const sb = () => {
  const client = getSupabase();
  if (!client) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env.',
    );
  }
  return client;
};

// ---------- Row types (snake_case, mirroring the DB) ----------

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

type ExpertProfileRow = {
  profile_id: string;
  industry_id: string;
  headline: string;
  hourly_rate_cents: number;
  years_experience: number;
  verified: boolean;
  cover_image_url: string | null;
  rating_average: number;
  rating_count: number;
  how_i_can_help: string | null;
  created_at: string;
  updated_at: string;
};

type CredentialRow = {
  id: string;
  expert_profile_id: string;
  title: string;
  issuer: string;
  year: number;
  end_year: number | null;
  type: BackgroundType;
};

type AvailabilityRow = {
  id: string;
  expert_profile_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
};

type AvailabilityDateRow = {
  id: string;
  expert_profile_id: string;
  date: string;
  start_minute: number;
  end_minute: number;
};

type BookingRow = {
  id: string;
  customer_id: string;
  expert_profile_id: string;
  start_at: string;
  end_at: string;
  medium: CallMedium;
  status: BookingStatus;
  payment_status: PaymentStatus;
  price_cents: number;
  call_room_url: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewRow = {
  id: string;
  booking_id: string;
  customer_id: string;
  expert_profile_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  created_at: string;
};

type ExpertWithRelations = ExpertProfileRow & {
  profiles: ProfileRow | null;
  credentials: CredentialRow[];
  availability_windows: AvailabilityRow[];
  availability_dates: AvailabilityDateRow[];
};

// ---------- Mappers (snake_case → app types) ----------

const mapProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  role: 'customer',
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  bio: row.bio,
  createdAt: row.created_at,
});

const mapCredential = (row: CredentialRow): Credential => ({
  id: row.id,
  title: row.title,
  issuer: row.issuer,
  year: row.year,
  endYear: row.end_year,
  type: row.type,
});

const mapAvailability = (row: AvailabilityRow): AvailabilityWindow => ({
  weekday: row.weekday as AvailabilityWindow['weekday'],
  startMinute: row.start_minute,
  endMinute: row.end_minute,
});

const mapAvailabilityDate = (row: AvailabilityDateRow): AvailabilityDate => ({
  id: row.id,
  date: row.date,
  startMinute: row.start_minute,
  endMinute: row.end_minute,
});

const mapExpert = (row: ExpertWithRelations): Expert | null => {
  if (!row.profiles) return null;
  return {
    id: row.profile_id,
    role: 'expert',
    displayName: row.profiles.display_name,
    avatarUrl: row.profiles.avatar_url,
    bio: row.profiles.bio,
    industryId: row.industry_id,
    headline: row.headline,
    hourlyRate: row.hourly_rate_cents,
    yearsExperience: row.years_experience,
    ratingAverage: Number(row.rating_average),
    ratingCount: row.rating_count,
    howICanHelp: row.how_i_can_help,
    credentials: (row.credentials ?? []).map(mapCredential),
    availability: (row.availability_windows ?? []).map(mapAvailability),
    availabilityDates: (row.availability_dates ?? []).map(mapAvailabilityDate),
    verified: row.verified,
    coverImageUrl: row.cover_image_url ?? '',
    createdAt: row.created_at,
  };
};

const mapBooking = (row: BookingRow): Booking => ({
  id: row.id,
  customerId: row.customer_id,
  expertId: row.expert_profile_id,
  slot: { startIso: row.start_at, endIso: row.end_at },
  medium: row.medium,
  status: row.status,
  paymentStatus: row.payment_status,
  priceCents: row.price_cents,
  callRoomUrl: row.call_room_url,
  createdAt: row.created_at,
});

const mapReview = (row: ReviewRow): Review => ({
  id: row.id,
  bookingId: row.booking_id,
  customerId: row.customer_id,
  expertId: row.expert_profile_id,
  rating: row.rating,
  comment: row.comment,
  createdAt: row.created_at,
});

// Shared select string for Expert + relations.
const EXPERT_SELECT = `
  profile_id, industry_id, headline, hourly_rate_cents, years_experience,
  verified, cover_image_url, rating_average, rating_count, how_i_can_help, created_at, updated_at,
  profiles!inner(id, display_name, avatar_url, bio, created_at, updated_at),
  credentials(id, expert_profile_id, title, issuer, year, end_year, type),
  availability_windows(id, expert_profile_id, weekday, start_minute, end_minute),
  availability_dates(id, expert_profile_id, date, start_minute, end_minute)
`;

// ---------- Storage uploads ----------

export type ImageBucket = 'avatars' | 'cover-images';

const extensionFor = (mime: string): string => {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
};

// Uploads to <bucket>/<userId>/<filename>. Convention enforced by RLS.
export const uploadImage = async (
  bucket: ImageBucket,
  userId: string,
  uri: string,
  mimeType: string,
): Promise<string> => {
  const client = sb();
  const ext = extensionFor(mimeType);
  // Stable filenames per bucket so re-uploads overwrite (avoids orphaned files).
  const filename = bucket === 'avatars' ? 'avatar' : 'cover';
  const path = `${userId}/${filename}.${ext}`;
  // Fetch the local file as a binary blob — works in Expo Go + web.
  const response = await fetch(uri);
  const blob = await response.blob();
  const { error } = await client.storage.from(bucket).upload(path, blob, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  // Append a cache-busting param so RN <Image /> picks up the new file after upload.
  return `${data.publicUrl}?v=${Date.now()}`;
};

// ---------- Profiles ----------

export const fetchMyProfile = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await sb()
    .from('profiles')
    .select('id, display_name, avatar_url, bio, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
};

export type ProfilePatch = Partial<{
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}>;

export const updateMyProfile = async (userId: string, patch: ProfilePatch): Promise<void> => {
  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;
  if (patch.bio !== undefined) update.bio = patch.bio;
  const { error } = await sb().from('profiles').update(update).eq('id', userId);
  if (error) throw error;
};

// ---------- Experts ----------

export type ExpertsFilters = {
  industryId?: string;
  query?: string;
  minRating?: number;
  maxHourlyRateCents?: number;
};

export const fetchExperts = async (filters: ExpertsFilters = {}): Promise<Expert[]> => {
  let q = sb()
    .from('expert_profiles')
    .select(EXPERT_SELECT)
    .order('rating_average', { ascending: false });
  if (filters.industryId) q = q.eq('industry_id', filters.industryId);
  if (typeof filters.minRating === 'number') q = q.gte('rating_average', filters.minRating);
  if (typeof filters.maxHourlyRateCents === 'number') {
    q = q.lte('hourly_rate_cents', filters.maxHourlyRateCents);
  }
  const { data, error } = await q;
  if (error) throw error;
  const experts = (data as unknown as ExpertWithRelations[])
    .map(mapExpert)
    .filter((e): e is Expert => e !== null);
  if (!filters.query) return experts;
  const needle = filters.query.toLowerCase();
  return experts.filter((e) =>
    `${e.displayName} ${e.headline} ${e.bio ?? ''} ${e.howICanHelp ?? ''}`
      .toLowerCase()
      .includes(needle),
  );
};

export const fetchExpert = async (id: string): Promise<Expert | null> => {
  const { data, error } = await sb()
    .from('expert_profiles')
    .select(EXPERT_SELECT)
    .eq('profile_id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapExpert(data as unknown as ExpertWithRelations) : null;
};

export type ExpertProfileInput = {
  industryId: string;
  headline: string;
  hourlyRateCents: number;
  yearsExperience: number;
  coverImageUrl?: string | null;
  howICanHelp?: string | null;
};

export const upsertMyExpertProfile = async (
  userId: string,
  input: ExpertProfileInput,
): Promise<void> => {
  const { error } = await sb()
    .from('expert_profiles')
    .upsert({
      profile_id: userId,
      industry_id: input.industryId,
      headline: input.headline,
      hourly_rate_cents: input.hourlyRateCents,
      years_experience: input.yearsExperience,
      cover_image_url: input.coverImageUrl ?? null,
      how_i_can_help: input.howICanHelp ?? null,
    });
  if (error) throw error;
};

export const deleteMyExpertProfile = async (userId: string): Promise<void> => {
  const { error } = await sb().from('expert_profiles').delete().eq('profile_id', userId);
  if (error) throw error;
};

// ---------- Background (work / education / certifications / other) ----------

export type BackgroundEntryInput = {
  type: BackgroundType;
  title: string;
  issuer: string;
  year: number;
  endYear?: number | null;
};

export const addCredential = async (
  expertId: string,
  c: BackgroundEntryInput,
): Promise<void> => {
  const { error } = await sb().from('credentials').insert({
    expert_profile_id: expertId,
    type: c.type,
    title: c.title,
    issuer: c.issuer,
    year: c.year,
    end_year: c.endYear ?? null,
  });
  if (error) throw error;
};

export const deleteCredential = async (id: string): Promise<void> => {
  const { error } = await sb().from('credentials').delete().eq('id', id);
  if (error) throw error;
};

// ---------- Availability ----------

export const setAvailability = async (
  expertId: string,
  windows: AvailabilityWindow[],
): Promise<void> => {
  const client = sb();
  const { error: delError } = await client
    .from('availability_windows')
    .delete()
    .eq('expert_profile_id', expertId);
  if (delError) throw delError;
  if (windows.length === 0) return;
  const { error } = await client.from('availability_windows').insert(
    windows.map((w) => ({
      expert_profile_id: expertId,
      weekday: w.weekday,
      start_minute: w.startMinute,
      end_minute: w.endMinute,
    })),
  );
  if (error) throw error;
};

// ---------- Availability dates (specific-date one-offs) ----------

export const addAvailabilityDate = async (
  expertId: string,
  input: { date: string; startMinute: number; endMinute: number },
): Promise<void> => {
  const { error } = await sb().from('availability_dates').insert({
    expert_profile_id: expertId,
    date: input.date,
    start_minute: input.startMinute,
    end_minute: input.endMinute,
  });
  if (error) throw error;
};

export const deleteAvailabilityDate = async (id: string): Promise<void> => {
  const { error } = await sb().from('availability_dates').delete().eq('id', id);
  if (error) throw error;
};

// ---------- Bookings ----------

export const fetchMyBookings = async (userId: string): Promise<Booking[]> => {
  const { data, error } = await sb()
    .from('bookings')
    .select('*')
    .or(`customer_id.eq.${userId},expert_profile_id.eq.${userId}`)
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data as BookingRow[]).map(mapBooking);
};

export const fetchBooking = async (id: string): Promise<Booking | null> => {
  const { data, error } = await sb()
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBooking(data as BookingRow) : null;
};

export type CreateBookingInput = {
  customerId: string;
  expertId: string;
  slot: TimeSlot;
  medium: CallMedium;
  priceCents: number;
  callRoomUrl?: string | null;
};

export const createBooking = async (input: CreateBookingInput): Promise<Booking> => {
  // Note: server-side default sets status='requested'. Expert must accept.
  const { data, error } = await sb()
    .from('bookings')
    .insert({
      customer_id: input.customerId,
      expert_profile_id: input.expertId,
      start_at: input.slot.startIso,
      end_at: input.slot.endIso,
      medium: input.medium,
      price_cents: input.priceCents,
      call_room_url: input.callRoomUrl ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapBooking(data as BookingRow);
};

export const updateBookingStatus = async (id: string, status: BookingStatus): Promise<void> => {
  const { error } = await sb().from('bookings').update({ status }).eq('id', id);
  if (error) throw error;
};

export const acceptBooking = async (id: string): Promise<void> => {
  const { error } = await sb()
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', id);
  if (error) throw error;
};

export const declineBooking = async (id: string, reason?: string): Promise<void> => {
  const { error } = await sb()
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: reason ?? null })
    .eq('id', id);
  if (error) throw error;
};

export const cancelBooking = async (id: string, reason?: string): Promise<void> => {
  const { error } = await sb()
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: reason ?? null })
    .eq('id', id);
  if (error) throw error;
};

// Pending requests for an expert to act on.
export const fetchPendingRequestsForExpert = async (
  userId: string,
): Promise<Booking[]> => {
  const { data, error } = await sb()
    .from('bookings')
    .select('*')
    .eq('expert_profile_id', userId)
    .eq('status', 'requested')
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data as BookingRow[]).map(mapBooking);
};

// Confirmed/in_progress bookings on an expert's calendar — used for slot
// generation so two customers can't double-book the same time.
export const fetchActiveBookingsForExpert = async (
  userId: string,
  sinceIso?: string,
): Promise<Booking[]> => {
  let q = sb()
    .from('bookings')
    .select('*')
    .eq('expert_profile_id', userId)
    .in('status', ['requested', 'confirmed', 'in_progress'])
    .order('start_at', { ascending: true });
  if (sinceIso) q = q.gte('start_at', sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data as BookingRow[]).map(mapBooking);
};

export const updateBookingPaymentStatus = async (
  id: string,
  paymentStatus: PaymentStatus,
): Promise<void> => {
  const { error } = await sb()
    .from('bookings')
    .update({ payment_status: paymentStatus })
    .eq('id', id);
  if (error) throw error;
};

export const fetchMyExpertBookings = async (
  userId: string,
  sinceIso?: string,
): Promise<Booking[]> => {
  let q = sb()
    .from('bookings')
    .select('*')
    .eq('expert_profile_id', userId)
    .order('start_at', { ascending: false });
  if (sinceIso) q = q.gte('start_at', sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data as BookingRow[]).map(mapBooking);
};

// ---------- Reviews ----------

export const fetchReviewsForExpert = async (expertId: string): Promise<Review[]> => {
  const { data, error } = await sb()
    .from('reviews')
    .select('*')
    .eq('expert_profile_id', expertId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ReviewRow[]).map(mapReview);
};

export type CreateReviewInput = {
  bookingId: string;
  customerId: string;
  expertId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string | null;
};

export const createReview = async (input: CreateReviewInput): Promise<void> => {
  const { error } = await sb().from('reviews').insert({
    booking_id: input.bookingId,
    customer_id: input.customerId,
    expert_profile_id: input.expertId,
    rating: input.rating,
    comment: input.comment ?? null,
  });
  if (error) throw error;
};
