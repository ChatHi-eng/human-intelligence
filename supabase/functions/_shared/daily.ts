// The video room for a booking (Daily.co): making sure one exists, and asking
// how many people are in it right now.

import { CALL_GRACE_MS } from './join.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

export type RoomBooking = {
  id: string;
  end_at: string;
  call_room_url: string | null;
  daily_room_name: string | null;
  daily_room_expires_at: string | null;
};

type DailyRoom = { name: string; url: string };

export const roomNameFor = (bookingId: string) => `hi-${bookingId.replace(/-/g, '').slice(0, 24)}`;

// Returns the booking's room, creating it if there is none yet. The room and
// everyone in it are closed five minutes after the scheduled finish.
export const ensureRoom = async (
  admin: Admin,
  dailyKey: string,
  booking: RoomBooking,
): Promise<{ url: string; name: string } | { error: 'ended' | 'unavailable' }> => {
  if (
    booking.daily_room_name &&
    booking.call_room_url &&
    booking.daily_room_expires_at &&
    Date.parse(booking.daily_room_expires_at) > Date.now()
  ) {
    return { url: booking.call_room_url, name: booking.daily_room_name };
  }

  const expiresAtMs = Date.parse(booking.end_at) + CALL_GRACE_MS;
  if (expiresAtMs <= Date.now()) return { error: 'ended' };
  const name = roomNameFor(booking.id);
  const headers = { Authorization: `Bearer ${dailyKey}`, 'Content-Type': 'application/json' };

  let room: DailyRoom | null = null;
  try {
    const created = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        privacy: 'public',
        properties: {
          exp: Math.floor(expiresAtMs / 1000),
          eject_at_room_exp: true,
          enable_screenshare: true,
          enable_chat: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });
    if (created.ok) {
      room = (await created.json()) as DailyRoom;
    } else {
      // Most likely both people opened their links at the same moment and the
      // other request made the room first. Use that one.
      const existing = await fetch(`https://api.daily.co/v1/rooms/${name}`, { headers });
      if (existing.ok) room = (await existing.json()) as DailyRoom;
      else console.error('Daily room error', created.status, await created.text());
    }
  } catch (err) {
    console.error('Daily request failed', err);
  }
  if (!room?.url) return { error: 'unavailable' };

  const { error } = await admin
    .from('bookings')
    .update({
      call_room_url: room.url,
      daily_room_name: room.name,
      daily_room_expires_at: new Date(expiresAtMs).toISOString(),
    })
    .eq('id', booking.id);
  if (error) console.error('room save failed', error.message);
  return { url: room.url, name: room.name };
};

// How many people are in the room at this moment, or null when Daily cannot
// say (then the caller goes by Palam's own record of who opened the call).
export const peopleInRoom = async (dailyKey: string, roomName: string): Promise<number | null> => {
  try {
    const res = await fetch(`https://api.daily.co/v1/rooms/${roomName}/presence`, {
      headers: { Authorization: `Bearer ${dailyKey}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { total_count?: unknown };
    return typeof body.total_count === 'number' ? body.total_count : null;
  } catch {
    return null;
  }
};
