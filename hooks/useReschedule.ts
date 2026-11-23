import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capture } from '@/services/analytics';
import {
  fetchPendingReschedule,
  proposeReschedule,
  rescheduleBooking,
  respondToReschedule,
  withdrawReschedule,
} from '@/services/api';

// Moving a booking to a new time. A customer moves their own; an expert
// suggests times and the customer answers. The rules live in the database
// (migration 0032); these only call it and refresh what is on screen.

const useRefresh = (bookingId: string | undefined) => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    void qc.invalidateQueries({ queryKey: ['bookings'] });
    void qc.invalidateQueries({ queryKey: ['reschedule', bookingId] });
  };
};

// The suggestion waiting on a booking, if any.
export const usePendingReschedule = (bookingId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['reschedule', bookingId],
    enabled: Boolean(bookingId) && enabled,
    queryFn: () => (bookingId ? fetchPendingReschedule(bookingId) : Promise.resolve(null)),
    // The other person may answer while this screen is open.
    refetchInterval: 15_000,
  });

export const useRescheduleBooking = (bookingId: string | undefined) => {
  const refresh = useRefresh(bookingId);
  return useMutation({
    mutationFn: (startIso: string) => {
      if (!bookingId) throw new Error('Booking not found.');
      return rescheduleBooking(bookingId, startIso);
    },
    onSuccess: () => {
      capture('booking_rescheduled', { by: 'customer' });
      refresh();
    },
  });
};

export const useProposeReschedule = (bookingId: string | undefined) => {
  const refresh = useRefresh(bookingId);
  return useMutation({
    mutationFn: (options: string[]) => {
      if (!bookingId) throw new Error('Booking not found.');
      return proposeReschedule(bookingId, options);
    },
    onSuccess: (_data, options) => {
      capture('reschedule_suggested', { options: options.length });
      refresh();
    },
  });
};

export const useRespondToReschedule = (bookingId: string | undefined) => {
  const refresh = useRefresh(bookingId);
  return useMutation({
    mutationFn: (input: { proposalId: string; choiceIso: string | null }) =>
      respondToReschedule(input.proposalId, input.choiceIso),
    onSuccess: (_data, input) => {
      capture(input.choiceIso ? 'booking_rescheduled' : 'reschedule_declined', { by: 'expert' });
      refresh();
    },
  });
};

export const useWithdrawReschedule = (bookingId: string | undefined) => {
  const refresh = useRefresh(bookingId);
  return useMutation({
    mutationFn: (proposalId: string) => withdrawReschedule(proposalId),
    onSuccess: refresh,
  });
};
