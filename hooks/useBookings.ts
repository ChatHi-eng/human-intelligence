import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mockBookings, mockExperts } from '@/lib/mockData';
import { confirmBookingPayment } from '@/services/stripe';
import { addBookingToDeviceCalendar } from '@/services/calendar';
import { emailService, scheduleBookingReminder } from '@/services/notifications';
import { createRoomForBooking } from '@/services/video';
import type { Booking, CallMedium, TimeSlot } from '@/types/booking';

const delay = <T,>(value: T, ms = 300) =>
  new Promise<T>((r) => setTimeout(() => r(value), ms));

// In-memory store for created bookings during the session. Real impl: Supabase.
const session: Booking[] = [...mockBookings];

export const useMyBookings = () =>
  useQuery({
    queryKey: ['bookings', 'me'],
    queryFn: () => delay([...session].sort((a, b) => a.slot.startIso.localeCompare(b.slot.startIso))),
    staleTime: 30_000,
  });

export const useBooking = (id: string | undefined) =>
  useQuery({
    queryKey: ['booking', id],
    enabled: Boolean(id),
    queryFn: () => delay(session.find((b) => b.id === id) ?? null),
  });

type CreateBookingInput = {
  expertId: string;
  slot: TimeSlot;
  medium: CallMedium;
  customerEmail?: string;
};

export const useCreateBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBookingInput): Promise<Booking> => {
      const expert = mockExperts.find((e) => e.id === input.expertId);
      if (!expert) throw new Error('Expert not found');
      const draft: Booking = {
        id: `bk_${Date.now()}`,
        customerId: 'cust_self',
        expertId: input.expertId,
        slot: input.slot,
        medium: input.medium,
        status: 'confirmed',
        paymentStatus: 'pending',
        priceCents: expert.hourlyRate,
        callRoomUrl: null,
        createdAt: new Date().toISOString(),
      };
      const payment = await confirmBookingPayment(draft);
      draft.paymentStatus = payment.status === 'succeeded' ? 'authorized' : 'failed';
      if (input.medium === 'video') {
        const room = await createRoomForBooking(draft.id);
        draft.callRoomUrl = room.url;
      }
      session.push(draft);
      void addBookingToDeviceCalendar(draft, expert.displayName);
      void scheduleBookingReminder(draft, expert.displayName);
      void emailService.sendBookingConfirmation(
        input.customerEmail ?? 'you@example.com',
        draft,
        expert.displayName,
      );
      return draft;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
};
