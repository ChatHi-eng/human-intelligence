// Notifications + email confirmation stubs.
// expo-notifications push only works in a dev build. Local notifications work in
// Expo Go on iOS but not for remote push. We schedule a local one for now and stub
// the email sender — the real flow will go through a Supabase Edge Function.
import type { Booking } from '@/types/booking';

export const scheduleBookingReminder = async (booking: Booking, expertName: string) => {
  try {
    const Notifications = await import('expo-notifications');
    const trigger = new Date(new Date(booking.slot.startIso).getTime() - 10 * 60_000);
    if (trigger.getTime() <= Date.now()) return { scheduled: false, reason: 'past' };
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Call with ${expertName} in 10 min`,
        body: 'Tap to open Palam and prepare for your call.',
        data: { bookingId: booking.id },
      },
      trigger: { type: 'date', date: trigger } as never,
    });
    return { scheduled: true };
  } catch (err) {
    return { scheduled: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
};

export const emailService = {
  sendBookingConfirmation: async (
    to: string,
    booking: Booking,
    expertName: string,
  ): Promise<{ queued: true }> => {
    // Stub. Real impl posts to a Supabase Edge Function that calls Resend / Postmark.
    console.log('[emailService] booking confirmation', { to, bookingId: booking.id, expertName });
    return { queued: true };
  },
};
