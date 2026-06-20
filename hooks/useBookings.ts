import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptBooking,
  cancelBooking,
  createBooking,
  declineBooking,
  fetchActiveBookingsForExpert,
  fetchBooking,
  fetchExpert,
  fetchMyBookings,
  fetchPendingRequestsForExpert,
  updateBookingPaymentStatus,
  updateBookingStatus,
} from '@/services/api';
import { addBookingToDeviceCalendar } from '@/services/calendar';
import { emailService, scheduleBookingReminder } from '@/services/notifications';
import { confirmBookingPayment } from '@/services/stripe';
import { createRoomForBooking } from '@/services/video';
import { useAuthStore } from '@/store/authStore';
import type { BookingStatus, CallMedium, TimeSlot } from '@/types/booking';

export const useMyBookings = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['bookings', 'me', userId],
    enabled: Boolean(userId),
    queryFn: () => (userId ? fetchMyBookings(userId) : Promise.resolve([])),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
};

export const useBooking = (id: string | undefined) =>
  useQuery({
    queryKey: ['booking', id],
    enabled: Boolean(id),
    queryFn: () => (id ? fetchBooking(id) : Promise.resolve(null)),
    staleTime: 10_000,
  });

// Bookings the expert needs to act on (status='requested').
export const usePendingRequests = () => {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['bookings', 'pending', userId],
    enabled: Boolean(userId),
    queryFn: () => (userId ? fetchPendingRequestsForExpert(userId) : Promise.resolve([])),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
};

// Active bookings on the expert's calendar — used for slot generation so we
// don't offer slots that overlap with existing bookings.
export const useExpertActiveBookings = (expertId: string | undefined) =>
  useQuery({
    queryKey: ['bookings', 'expert-active', expertId],
    enabled: Boolean(expertId),
    queryFn: async () => {
      if (!expertId) return [];
      const since = new Date(Date.now() - 60_000).toISOString(); // ~now
      return fetchActiveBookingsForExpert(expertId, since);
    },
    staleTime: 30_000,
  });

export type CreateBookingMutationInput = {
  expertId: string;
  slot: TimeSlot;
  medium: CallMedium;
  customerEmail?: string;
};

export const useCreateBooking = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBookingMutationInput) => {
      if (!userId) throw new Error('Not signed in');
      const expert = await fetchExpert(input.expertId);
      if (!expert) throw new Error('Expert not found');

      const room =
        input.medium === 'video' ? await createRoomForBooking(`pending-${Date.now()}`) : null;

      // Created in 'requested' status (server default). Expert must accept.
      const booking = await createBooking({
        customerId: userId,
        expertId: input.expertId,
        slot: input.slot,
        medium: input.medium,
        priceCents: expert.hourlyRate,
        callRoomUrl: room?.url ?? null,
      });

      // Authorize the payment (hold funds). Stripe is stubbed — real capture
      // happens when expert accepts.
      const payment = await confirmBookingPayment(booking);
      await updateBookingPaymentStatus(
        booking.id,
        payment.status === 'succeeded' ? 'authorized' : 'failed',
      );

      void emailService.sendBookingConfirmation(
        input.customerEmail ?? 'you@example.com',
        booking,
        expert.displayName,
      );

      return booking;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
};

export const useAcceptBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (booking: { id: string; expertName: string; startIso: string; endIso: string }) => {
      await acceptBooking(booking.id);
      // Schedule a reminder + (best-effort) add to the expert's device calendar.
      void scheduleBookingReminder(
        {
          id: booking.id,
          slot: { startIso: booking.startIso, endIso: booking.endIso },
        } as never,
        booking.expertName,
      );
      void addBookingToDeviceCalendar(
        {
          id: booking.id,
          slot: { startIso: booking.startIso, endIso: booking.endIso },
        } as never,
        booking.expertName,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
};

export const useDeclineBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason?: string }) => declineBooking(input.id, input.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
};

export const useCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason?: string }) => cancelBooking(input.id, input.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
};

export const useUpdateBookingStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) =>
      updateBookingStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['booking'] });
    },
  });
};
