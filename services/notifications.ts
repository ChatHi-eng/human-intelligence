// Local notification scheduling.
// expo-notifications push only works in a dev build. Local notifications work in
// Expo Go on iOS but not for remote push, so we schedule a local reminder for now.
// Emails are server-side only: database webhooks → the lifecycle-emails and
// notify-application Edge Functions (see README "Lifecycle emails"). The client
// never sends email.
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
