import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBooking,
  fetchBooking,
  fetchExpert,
  fetchMyBookings,
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
    staleTime: 30_000,
  });
};

export const useBooking = (id: string | undefined) =>
  useQuery({
    queryKey: ['booking', id],
    enabled: Boolean(id),
    queryFn: () => (id ? fetchBooking(id) : Promise.resolve(null)),
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

      const booking = await createBooking({
        customerId: userId,
        expertId: input.expertId,
        slot: input.slot,
        medium: input.medium,
        priceCents: expert.hourlyRate,
        callRoomUrl: room?.url ?? null,
      });

      // Payment is stubbed until Stripe is wired in a dev build.
      const payment = await confirmBookingPayment(booking);
      await updateBookingPaymentStatus(
        booking.id,
        payment.status === 'succeeded' ? 'authorized' : 'failed',
      );

      // Best-effort side effects — don't block on failure.
      void addBookingToDeviceCalendar(booking, expert.displayName);
      void scheduleBookingReminder(booking, expert.displayName);
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
