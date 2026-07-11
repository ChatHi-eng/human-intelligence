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

// Kept for the (still-stubbed) native call screen. Once we move to a dev build
// and install the Daily React Native SDK, this becomes a real CallObject
// subscription. For now it's a no-op so the existing UI code compiles.
export const joinCall = (_room: CallRoom, onEvent: (e: CallEvent) => void) => {
  const t = setTimeout(() => onEvent({ type: 'joined' }), 300);
  return {
    leave: () => {
      clearTimeout(t);
      onEvent({ type: 'left' });
    },
  };
};
