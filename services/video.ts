// Video provider: Daily.co (chosen over Twilio — Twilio Programmable Video is sunset
// for new customers as of Dec 2024). Real integration uses @daily-co/react-native-daily-js,
// which requires a dev build (not Expo Go compatible). Until then, this stub gives the
// rest of the app a typed API surface to call against.

export type CallRoom = {
  url: string;
  token: string | null;
  expiresAtIso: string;
};

export type CallEvent =
  | { type: 'joined' }
  | { type: 'left' }
  | { type: 'participant-joined'; participantId: string }
  | { type: 'error'; message: string };

export const createRoomForBooking = async (bookingId: string): Promise<CallRoom> => {
  await new Promise((r) => setTimeout(r, 400));
  const domain = process.env.EXPO_PUBLIC_DAILY_DOMAIN ?? 'demo.daily.co';
  return {
    url: `https://${domain}/booking-${bookingId}`,
    token: null,
    expiresAtIso: new Date(Date.now() + 60 * 60_000).toISOString(),
  };
};

// In the stub, the "call" is a local timer + mock event stream. The real Daily SDK
// will replace this with a CallObject subscription.
export const joinCall = (_room: CallRoom, onEvent: (e: CallEvent) => void) => {
  const t = setTimeout(() => onEvent({ type: 'joined' }), 300);
  return {
    leave: () => {
      clearTimeout(t);
      onEvent({ type: 'left' });
    },
  };
};
