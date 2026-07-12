// Device calendar (expo-calendar) + Google Calendar sync stub.
// expo-calendar is a native module — works only in a dev build, not Expo Go.
// To keep Expo Go runnable for now, we dynamically import and no-op if unavailable.
import type { Booking } from '@/types/booking';

export type AddEventResult = { eventId: string } | { skipped: true; reason: string };

export const addBookingToDeviceCalendar = async (
  booking: Booking,
  expertName: string,
): Promise<AddEventResult> => {
  try {
    const ExpoCalendar = await import('expo-calendar');
    const perm = await ExpoCalendar.requestCalendarPermissionsAsync();
    if (perm.status !== 'granted') {
      return { skipped: true, reason: 'calendar permission denied' };
    }
    const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
    const writable = calendars.find((c) => c.allowsModifications);
    if (!writable) return { skipped: true, reason: 'no writable calendar' };
    const eventId = await ExpoCalendar.createEventAsync(writable.id, {
      title: `Call with ${expertName}`,
      startDate: new Date(booking.slot.startIso),
      endDate: new Date(booking.slot.endIso),
      notes: `Palam booking ${booking.id}`,
    });
    return { eventId };
  } catch (err) {
    return { skipped: true, reason: err instanceof Error ? err.message : 'unknown' };
  }
};

// Google Calendar two-way sync — placeholder. Real flow is OAuth → token swap on a
// backend → fetch+push events via the Google Calendar REST API.
export const connectGoogleCalendar = async (): Promise<{ connected: boolean }> => {
  await new Promise((r) => setTimeout(r, 400));
  return { connected: false };
};
