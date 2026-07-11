import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReview,
  fetchMyReviewForBooking,
  fetchReviewsForExpert,
  updateBookingStatus,
} from '@/services/api';
import { useAuthStore } from '@/store/authStore';

export const useReviewsForExpert = (expertId: string | undefined) =>
  useQuery({
    queryKey: ['reviews', 'expert', expertId],
    enabled: Boolean(expertId),
    queryFn: () => (expertId ? fetchReviewsForExpert(expertId) : Promise.resolve([])),
    staleTime: 60_000,
  });

export const useMyReviewForBooking = (bookingId: string | undefined) =>
  useQuery({
    queryKey: ['reviews', 'booking', bookingId],
    enabled: Boolean(bookingId),
    queryFn: () => (bookingId ? fetchMyReviewForBooking(bookingId) : Promise.resolve(null)),
  });

export type SubmitReviewInput = {
  bookingId: string;
  expertId: string;
  bookingStatus: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string | null;
};

export const useSubmitReview = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitReviewInput) => {
      if (!userId) throw new Error('Not signed in');
      // RLS only allows reviews on completed bookings; the call ending is what
      // completes a session, so flip the status here if it hasn't been already.
      if (input.bookingStatus !== 'completed') {
        await updateBookingStatus(input.bookingId, 'completed');
      }
      await createReview({
        bookingId: input.bookingId,
        customerId: userId,
        expertId: input.expertId,
        rating: input.rating,
        comment: input.comment ?? null,
      });
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      void qc.invalidateQueries({ queryKey: ['expert', input.expertId] });
      void qc.invalidateQueries({ queryKey: ['experts'] });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['booking', input.bookingId] });
    },
  });
};
