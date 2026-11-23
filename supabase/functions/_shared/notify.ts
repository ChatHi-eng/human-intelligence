// Sending a notification to every device a person has switched on: browsers
// (Web Push) and, once there is a phone app, phones (Expo's push service).
// Shared by lifecycle-emails, send-reminders and push.
//
// Devices live in public.push_tokens (one row each). The server's Web Push
// keys live in public.push_keys, which only the service role can read; they
// are created the first time anything asks for them, so there is no secret
// to set up by hand.

import { generateVapidKeys, sendWebPush, type VapidKeys } from './webpush.ts';

// Where a tap on a notification lands.
export const APP_URL = 'https://app.palamapp.com';
const VAPID_SUBJECT = 'mailto:info@palamapp.com';

// deno-lint-ignore no-explicit-any
type Admin = any;

export type PushMessage = {
  title: string;
  body: string;
  // Path inside the app, e.g. /booking/<id>.
  path?: string;
  // Notifications with the same tag replace each other on the device.
  tag?: string;
  // How long the push service should keep trying if the device is offline.
  ttlSeconds?: number;
};

let cachedKeys: VapidKeys | null = null;

export const loadVapidKeys = async (admin: Admin): Promise<VapidKeys | null> => {
  if (cachedKeys) return cachedKeys;
  const read = async (): Promise<VapidKeys | null> => {
    const { data, error } = await admin
      .from('push_keys')
      .select('public_key, private_jwk')
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('push_keys read failed', error.message);
      return null;
    }
    return data ? { publicKey: data.public_key, privateJwk: data.private_jwk } : null;
  };
  let keys = await read();
  if (!keys) {
    // First use. If two requests race, one insert wins and both read it back.
    const fresh = await generateVapidKeys();
    const { error } = await admin
      .from('push_keys')
      .upsert(
        { id: true, public_key: fresh.publicKey, private_jwk: fresh.privateJwk },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    if (error) console.error('push_keys insert failed', error.message);
    keys = await read();
  }
  cachedKeys = keys;
  return keys;
};

type TokenRow = {
  token: string;
  user_id: string;
  platform: string | null;
  p256dh: string | null;
  auth: string | null;
};

const isExpoToken = (token: string) => /^Expo(nent)?PushToken\[/.test(token);

// Sends one message to each person. Never throws: a failed push must not stop
// the email that goes with it. Returns how many devices accepted it.
export const pushToUsers = async (
  admin: Admin,
  messages: { userId: string; message: PushMessage }[],
): Promise<number> => {
  if (messages.length === 0) return 0;
  let delivered = 0;
  try {
    const ids = [...new Set(messages.map((m) => m.userId))];
    const { data, error } = await admin
      .from('push_tokens')
      .select('token, user_id, platform, p256dh, auth')
      .in('user_id', ids);
    if (error) {
      console.error('push_tokens read failed', error.message);
      return 0;
    }
    const rows = (data ?? []) as TokenRow[];
    if (rows.length === 0) return 0;

    const dead: string[] = [];
    const expo: Record<string, unknown>[] = [];
    let keys: VapidKeys | null = null;

    for (const { userId, message } of messages) {
      const url = `${APP_URL}${message.path ?? '/'}`;
      for (const row of rows.filter((r) => r.user_id === userId)) {
        if (isExpoToken(row.token)) {
          expo.push({
            to: row.token,
            title: message.title,
            body: message.body,
            sound: 'default',
            data: { url, path: message.path ?? '/' },
          });
          continue;
        }
        if (!row.p256dh || !row.auth) continue;
        keys ??= await loadVapidKeys(admin);
        if (!keys) continue;
        try {
          const result = await sendWebPush(
            { endpoint: row.token, p256dh: row.p256dh, auth: row.auth },
            { title: message.title, body: message.body, path: message.path ?? '/', tag: message.tag },
            keys,
            { subject: VAPID_SUBJECT, ttlSeconds: message.ttlSeconds ?? 60 * 60 },
          );
          if (result.ok) delivered += 1;
          else if (result.gone) dead.push(row.token);
          else console.error('web push refused', result.status);
        } catch (err) {
          console.error('web push failed', err);
        }
      }
    }

    if (expo.length > 0) {
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(expo),
        });
        if (res.ok) delivered += expo.length;
        else console.error('Expo push error', res.status, await res.text());
      } catch (err) {
        console.error('Expo push request failed', err);
      }
    }

    // A browser that has dropped its subscription will never take another
    // message, so stop trying.
    if (dead.length > 0) {
      const { error: pruneError } = await admin.from('push_tokens').delete().in('token', dead);
      if (pruneError) console.error('push_tokens prune failed', pruneError.message);
    }
  } catch (err) {
    console.error('pushToUsers failed', err);
  }
  return delivered;
};

// ---------------------------------------------------------------------------
// Times, in the reader's own time zone when we know it.
// ---------------------------------------------------------------------------

// Each person's zone as their browser last reported it (notification_prefs).
export const timezonesOf = async (admin: Admin, ids: string[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  try {
    const { data } = await admin
      .from('notification_prefs')
      .select('user_id, timezone')
      .in('user_id', ids);
    for (const row of data ?? []) if (row.timezone) map.set(row.user_id, row.timezone);
  } catch (err) {
    console.error('timezone lookup failed', err);
  }
  return map;
};

// "Tue, Nov 24, 3:00 PM" for a notification. When the zone is only a guess,
// the zone's short name is added so the time cannot be misread.
export const shortWhen = (startIso: string, tz: string, known: boolean): string => {
  const build = (zone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(known ? {} : { timeZoneName: 'short' }),
    }).format(new Date(startIso));
  try {
    return build(tz);
  } catch {
    return build('UTC');
  }
};

// "3:00 PM"
export const clockTime = (startIso: string, tz: string, known: boolean): string => {
  const build = (zone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      ...(known ? {} : { timeZoneName: 'short' }),
    }).format(new Date(startIso));
  try {
    return build(tz);
  } catch {
    return build('UTC');
  }
};

// ---------------------------------------------------------------------------
// Calendar: a file both people can add to any calendar, and a Google link.
// ---------------------------------------------------------------------------

const icsStamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const icsText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export type CalendarEvent = {
  bookingId: string;
  startIso: string;
  endIso: string;
  title: string;
  description: string;
  // Where the calendar entry's own link goes. Defaults to the booking.
  url?: string;
};

export const calendarFile = (event: CalendarEvent): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Palam//Sessions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.bookingId}@palamapp.com`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(event.startIso)}`,
    `DTEND:${icsStamp(event.endIso)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    `URL:${event.url ?? `${APP_URL}/booking/${event.bookingId}`}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Palam session in 10 minutes',
    'TRIGGER:-PT10M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

export const googleCalendarUrl = (event: CalendarEvent): string =>
  `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${icsStamp(event.startIso)}/${icsStamp(event.endIso)}`,
    details: event.description,
  }).toString()}`;

// Base64 of a text file, for an email attachment.
export const base64Text = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
