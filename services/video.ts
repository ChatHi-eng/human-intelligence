// Video provider: Daily.co. Until the dev build lands and we can ship the
// native SDK (@daily-co/react-native-daily-js), customers and experts join the
// Daily room URL in an in-app web browser — Daily's hosted call page handles
// camera/mic permissions and rendering in mobile Safari/Chrome.
import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from './supabase';

export type CallRoom = {
  url: string;
  name: string;
};

export type CallEvent =
  | { type: 'joined' }
  | { type: 'left' }
  | { type: 'participant-joined'; participantId: string }
  | { type: 'error'; message: string };

/**
 * Asks the create-daily-room Edge Function to mint (or reuse) a Daily room for
 * the booking. Persists URL + name onto the booking row server-side.
 */
export const createRoomForBooking = async (bookingId: string): Promise<CallRoom> => {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.functions.invoke<CallRoom>('create-daily-room', {
    body: { bookingId },
  });
  if (error) throw error;
  if (!data || !data.url) throw new Error('No room URL returned');
  return data;
};

// What the join-call Edge Function says when asked to open a call.
type JoinDetails = {
  bookingId: string;
  otherName: string | null;
  startAt: string;
  endAt: string;
  kind: 'session' | 'intro';
};
export type JoinResult =
  | ({ status: 'ok'; url: string } & JoinDetails)
  | ({ status: 'early'; joinFromAt: string } & JoinDetails)
  | ({ status: 'ended' | 'cancelled' | 'not_confirmed' } & JoinDetails)
  | { status: 'invalid' };

/**
 * Opens a booking's call for this person and lets Palam know they went in,
 * which is what makes "the other person is waiting" possible. With a `key`
 * (from a personal join link) no sign-in is needed; without one the person
 * must be signed in and on the booking.
 */
export const joinCall = async (bookingId: string, key?: string): Promise<JoinResult> => {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.functions.invoke<JoinResult>('join-call', {
    body: key ? { bookingId, key } : { bookingId },
  });
  if (error) throw error;
  if (!data || typeof data.status !== 'string') throw new Error('No answer from the call service');
  return data;
};

/**
 * Opens the Daily room. Uses plain openBrowserAsync (not openAuthSessionAsync)
 * because there's no OAuth-style redirect to intercept — we just need the URL
 * to open. On native this pops an in-app browser; on web it opens a new tab.
 */
export const openCallRoom = async (
  roomUrl: string,
): Promise<{ type: 'cancel' | 'dismiss' | 'opened' | 'unknown' }> => {
  const result = await WebBrowser.openBrowserAsync(roomUrl, { showInRecents: true });
  if (result.type === 'opened') return { type: 'opened' };
  if (result.type === 'cancel') return { type: 'cancel' };
  if (result.type === 'dismiss') return { type: 'dismiss' };
  return { type: 'unknown' };
};

