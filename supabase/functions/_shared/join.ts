// A personal link that opens someone's call: /join?b=<booking>&k=<key>.
//
// The key says which booking and which side (customer or expert) the link was
// made for, and is signed by the server, so it cannot be made up or changed.
// Whoever holds the link can join that one call, the same as a meeting link
// from any calendar invite, and nothing else: it does not sign anyone in.
// Uses only WebCrypto and imports nothing, so the tests run the same code in
// Node.

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export type JoinRole = 'customer' | 'expert';

// People can go in from fifteen minutes before the start.
export const JOIN_OPENS_MS = 15 * 60_000;
// The room closes five minutes after the scheduled finish (create-daily-room).
export const CALL_GRACE_MS = 5 * 60_000;

const enc = new TextEncoder();

const sign = async (secret: string, text: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`palam-join-v1:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
};

// "c" or "e" for the side, then 128 bits of signature.
export const joinKey = async (secret: string, bookingId: string, role: JoinRole): Promise<string> =>
  (role === 'customer' ? 'c' : 'e') +
  b64url((await sign(secret, `${bookingId}:${role}`)).slice(0, 16));

// Which side a key was made for, or null when it is not a real key for this
// booking.
export const readJoinKey = async (
  secret: string,
  bookingId: string,
  key: string,
): Promise<JoinRole | null> => {
  const role: JoinRole | null = key.startsWith('c') ? 'customer' : key.startsWith('e') ? 'expert' : null;
  if (!role) return null;
  const expected = await joinKey(secret, bookingId, role);
  if (expected.length !== key.length) return null;
  // Compare every character whatever happens, so timing says nothing.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0 ? role : null;
};

export const joinPath = (bookingId: string, key: string): string =>
  `/join?b=${bookingId}&k=${key}`;
