// The video room for a booking (Daily.co).
//
// Each booking has its own private room. Nobody gets in with the room's
// address alone: join-call hands each person a pass (a Daily meeting token)
// that names their side of the booking, and the room reports every visit
// under that name. That record is what settles a no-show
// (./attendance.ts, ./settle.ts).

import { passId, roleOfPass, type AttendanceRole } from './attendance.ts';
import { CALL_GRACE_MS } from './join.ts';
import { APP_URL } from './notify.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

const API = 'https://api.daily.co/v1';

export type RoomBooking = {
  id: string;
  end_at: string;
  daily_room_url?: string | null;
  daily_room_private?: boolean | null;
  daily_room_name: string | null;
  daily_room_expires_at: string | null;
};

type DailyRoom = { name: string; url: string };

export const roomNameFor = (bookingId: string) => `hi-${bookingId.replace(/-/g, '').slice(0, 24)}`;

// What the app opens for a booking's call. Never the room's own address: the
// room only lets in someone holding a pass, and this page is where a signed
// in person gets theirs.
export const appJoinUrl = (bookingId: string) => `${APP_URL}/join?b=${bookingId}`;

const headersFor = (dailyKey: string) => ({
  Authorization: `Bearer ${dailyKey}`,
  'Content-Type': 'application/json',
});

// Returns the booking's room, creating it if there is none yet. The room and
// everyone in it are closed five minutes after the scheduled finish.
export const ensureRoom = async (
  admin: Admin,
  dailyKey: string,
  booking: RoomBooking,
): Promise<{ url: string; name: string; expiresAtMs: number } | { error: 'ended' | 'unavailable' }> => {
  if (
    booking.daily_room_private &&
    booking.daily_room_name &&
    booking.daily_room_url &&
    booking.daily_room_expires_at &&
    Date.parse(booking.daily_room_expires_at) > Date.now()
  ) {
    return {
      url: booking.daily_room_url,
      name: booking.daily_room_name,
      expiresAtMs: Date.parse(booking.daily_room_expires_at),
    };
  }

  const expiresAtMs = Date.parse(booking.end_at) + CALL_GRACE_MS;
  if (expiresAtMs <= Date.now()) return { error: 'ended' };
  const name = roomNameFor(booking.id);
  const headers = headersFor(dailyKey);
  const properties = {
    exp: Math.floor(expiresAtMs / 1000),
    eject_at_room_exp: true,
    // Opening your link puts you in the room. With a waiting screen in
    // front, someone could sit on it and never show as having come.
    enable_prejoin_ui: false,
    enable_knocking: false,
    // The same person coming in twice (a refresh, a second device) replaces
    // their earlier visit instead of standing beside it.
    enforce_unique_user_ids: true,
    enable_screenshare: true,
    enable_chat: true,
    start_video_off: false,
    start_audio_off: false,
  };

  let room: DailyRoom | null = null;
  try {
    const created = await fetch(`${API}/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, privacy: 'private', properties }),
    });
    if (created.ok) {
      room = (await created.json()) as DailyRoom;
    } else {
      // A room of this name is already there: both people opened their links
      // at the same moment, the booking was moved to a new time, or the room
      // was made before rooms were private. Bring it up to date and use it.
      const updated = await fetch(`${API}/rooms/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ privacy: 'private', properties }),
      });
      if (updated.ok) room = (await updated.json()) as DailyRoom;
      else console.error('Daily room error', created.status, await created.text(), updated.status, await updated.text());
    }
  } catch (err) {
    console.error('Daily request failed', err);
  }
  if (!room?.url) return { error: 'unavailable' };

  const { error } = await admin
    .from('bookings')
    .update({
      // What the app opens. See appJoinUrl.
      call_room_url: appJoinUrl(booking.id),
      daily_room_url: room.url,
      daily_room_private: true,
      daily_room_name: room.name,
      daily_room_expires_at: new Date(expiresAtMs).toISOString(),
    })
    .eq('id', booking.id);
  if (error) console.error('room save failed', error.message);
  return { url: room.url, name: room.name, expiresAtMs };
};

// A pass into one booking's room for one person. It stops working when the
// room closes. Null when Daily would not make one.
export const roomPass = async (
  dailyKey: string,
  input: { room: string; role: AttendanceRole; userId: string; name: string | null; expiresAtMs: number },
): Promise<string | null> => {
  try {
    const res = await fetch(`${API}/meeting-tokens`, {
      method: 'POST',
      headers: headersFor(dailyKey),
      body: JSON.stringify({
        properties: {
          room_name: input.room,
          user_id: passId(input.role, input.userId),
          ...(input.name ? { user_name: input.name.slice(0, 60) } : {}),
          exp: Math.floor(input.expiresAtMs / 1000),
          eject_at_token_exp: true,
          is_owner: false,
        },
      }),
    });
    if (!res.ok) {
      console.error('Daily pass error', res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as { token?: unknown };
    return typeof body.token === 'string' ? body.token : null;
  } catch (err) {
    console.error('Daily pass request failed', err);
    return null;
  }
};

export type InRoom = {
  total: number;
  customer: boolean;
  expert: boolean;
  // When each came in, where Daily says (milliseconds since 1970).
  since: { customer: number | null; expert: number | null };
};

// Who is in the room at this moment (Daily's own count runs up to fifteen
// seconds behind), or null when Daily cannot say.
export const whoIsInRoom = async (dailyKey: string, roomName: string): Promise<InRoom | null> => {
  try {
    const res = await fetch(`${API}/rooms/${roomName}/presence`, {
      headers: { Authorization: `Bearer ${dailyKey}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { total_count?: unknown; data?: unknown };
    const people = Array.isArray(body.data)
      ? (body.data as { userId?: unknown; joinTime?: unknown }[])
      : [];
    const since: InRoom['since'] = { customer: null, expert: null };
    for (const p of people) {
      const role = roleOfPass(typeof p.userId === 'string' ? p.userId : null);
      if (!role) continue;
      const joined = typeof p.joinTime === 'string' ? Date.parse(p.joinTime) : Number.NaN;
      const at = Number.isFinite(joined) ? joined : Date.now();
      since[role] = since[role] === null ? at : Math.min(since[role] as number, at);
    }
    return {
      total: typeof body.total_count === 'number' ? body.total_count : people.length,
      customer: since.customer !== null,
      expert: since.expert !== null,
      since,
    };
  } catch {
    return null;
  }
};

// How many people are in the room at this moment, or null when Daily cannot
// say (then the caller goes by Palam's own record of who opened the call).
export const peopleInRoom = async (dailyKey: string, roomName: string): Promise<number | null> =>
  (await whoIsInRoom(dailyKey, roomName))?.total ?? null;

export type MeetingVisit = {
  sessionId: string;
  pass: string | null;
  joinedAtMs: number;
  durationSeconds: number;
};

// Daily's own after-the-fact list of everyone who was in the room. Coarser
// than the live reports (times are to the nearest fifteen seconds or so) but
// it does not depend on a message having reached Palam. Null when Daily
// could not be asked.
export const roomMeetings = async (dailyKey: string, roomName: string): Promise<MeetingVisit[] | null> => {
  try {
    const res = await fetch(`${API}/meetings?room=${encodeURIComponent(roomName)}&limit=50`, {
      headers: { Authorization: `Bearer ${dailyKey}` },
    });
    if (!res.ok) {
      console.error('Daily meetings error', res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as { data?: unknown };
    const meetings = Array.isArray(body.data) ? body.data : [];
    const visits: MeetingVisit[] = [];
    for (const meeting of meetings as { participants?: unknown }[]) {
      const people = Array.isArray(meeting.participants) ? meeting.participants : [];
      for (const p of people as Record<string, unknown>[]) {
        if (typeof p.participant_id !== 'string' || typeof p.join_time !== 'number') continue;
        visits.push({
          sessionId: p.participant_id,
          pass: typeof p.user_id === 'string' ? p.user_id : null,
          joinedAtMs: p.join_time * 1000,
          durationSeconds: typeof p.duration === 'number' ? p.duration : 0,
        });
      }
    }
    return visits;
  } catch (err) {
    console.error('Daily meetings request failed', err);
    return null;
  }
};

// ---- The line the room reports on ------------------------------------------

const WEBHOOK_EVENTS = ['participant.joined', 'participant.left'];

type DailyWebhook = {
  uuid: string;
  url: string;
  state?: string;
  failedCount?: number;
  eventTypes?: string[];
  retryType?: string;
};

const randomSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
};

// Makes sure Daily is reporting visits to Palam, and that the line is up.
// Called on a schedule. The secret that signs the reports is made here and
// kept in the database; Daily is given the same one.
export const ensureWebhook = async (
  admin: Admin,
  dailyKey: string,
  endpoint: string,
): Promise<{ state: string; created?: boolean; error?: string }> => {
  const headers = headersFor(dailyKey);
  const { data: saved } = await admin.from('daily_webhook').select('*').maybeSingle();

  let hmac = saved?.hmac as string | undefined;
  if (!hmac) {
    hmac = randomSecret();
    const { error } = await admin.from('daily_webhook').insert({ hmac });
    if (error) {
      // Another run got there first: use theirs.
      const { data: again } = await admin.from('daily_webhook').select('hmac').maybeSingle();
      hmac = again?.hmac as string | undefined;
      if (!hmac) return { state: 'error', error: error.message };
    }
  }

  const note = async (hook: DailyWebhook | null, state: string) => {
    await admin
      .from('daily_webhook')
      .update({
        webhook_uuid: hook?.uuid ?? null,
        state,
        failed_count: hook?.failedCount ?? null,
        checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
  };

  try {
    const listed = await fetch(`${API}/webhooks`, { headers });
    if (!listed.ok) {
      const text = await listed.text();
      await note(null, 'error');
      return { state: 'error', error: `list ${listed.status} ${text.slice(0, 200)}` };
    }
    const hooks = (await listed.json()) as DailyWebhook[];
    const mine = (Array.isArray(hooks) ? hooks : []).find((h) => h.url === endpoint) ?? null;

    if (!mine) {
      const created = await fetch(`${API}/webhooks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: endpoint, eventTypes: WEBHOOK_EVENTS, hmac, retryType: 'exponential' }),
      });
      if (!created.ok) {
        const text = await created.text();
        await note(null, 'error');
        return { state: 'error', error: `create ${created.status} ${text.slice(0, 200)}` };
      }
      const hook = (await created.json()) as DailyWebhook;
      await note(hook, hook.state ?? 'ACTIVE');
      return { state: hook.state ?? 'ACTIVE', created: true };
    }

    const wrongSetup =
      mine.state === 'FAILED' ||
      mine.retryType !== 'exponential' ||
      WEBHOOK_EVENTS.some((e) => !(mine.eventTypes ?? []).includes(e)) ||
      saved?.webhook_uuid !== mine.uuid;
    if (wrongSetup) {
      // Posting to it again switches a failed line back on, and makes sure
      // it is signing with the secret Palam holds.
      const fixed = await fetch(`${API}/webhooks/${mine.uuid}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: endpoint, eventTypes: WEBHOOK_EVENTS, hmac, retryType: 'exponential' }),
      });
      if (!fixed.ok) {
        const text = await fixed.text();
        await note(mine, mine.state ?? 'error');
        return { state: mine.state ?? 'error', error: `update ${fixed.status} ${text.slice(0, 200)}` };
      }
      const hook = (await fixed.json()) as DailyWebhook;
      await note(hook, hook.state ?? 'ACTIVE');
      return { state: hook.state ?? 'ACTIVE' };
    }
    await note(mine, mine.state ?? 'ACTIVE');
    return { state: mine.state ?? 'ACTIVE' };
  } catch (err) {
    await note(null, 'error');
    return { state: 'error', error: err instanceof Error ? err.message : 'request failed' };
  }
};
