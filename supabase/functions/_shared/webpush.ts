// Web Push for browsers: the message encryption (RFC 8291, "aes128gcm") and
// the sender identification (VAPID, RFC 8292) that every browser push service
// requires. Uses only WebCrypto and fetch, so the same file runs in Supabase
// Edge Functions (Deno) and in Node, where the tests exercise it.

const enc = new TextEncoder();

export const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromB64url = (text: string): Uint8Array => {
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

// WebCrypto wants plain ArrayBuffers; this keeps the type checker and every
// runtime happy.
const buf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

// The server's identity. publicKey is the 65-byte P-256 point, base64url, and
// is what the browser is given when it subscribes. privateJwk never leaves
// the server.
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

export const generateVapidKeys = async (): Promise<VapidKeys> => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateJwk };
};

const hkdf = async (
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) },
      key,
      length * 8,
    ),
  );
};

// One encrypted record, ready to be the body of the POST to the push service.
// p256dh and auth come from the browser's subscription.
export const encryptPayload = async (
  payload: string,
  p256dh: string,
  auth: string,
): Promise<Uint8Array> => {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey(
    'raw',
    buf(uaPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256),
  );

  const ikm = await hkdf(
    authSecret,
    shared,
    concat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  );
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (here, only) record.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(plaintext)),
  );

  // Header: salt (16) | record size (4) | key length (1) | our public key.
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
};

// "Authorization: vapid t=<signed token>, k=<public key>". The token says who
// is sending and is only valid for the push service it names.
export const vapidAuthorization = async (
  endpoint: string,
  keys: VapidKeys,
  subject: string,
): Promise<string> => {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    keys.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      buf(enc.encode(`${header}.${claims}`)),
    ),
  );
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
};

// The address a subscription posts to is supplied by a browser, so it is only
// trusted when it belongs to a real browser push service. Anything else is
// never contacted.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
  /\.push\.apple\.com$/,
];

export const isPushServiceUrl = (endpoint: string): boolean => {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
};

export type WebPushSubscription = { endpoint: string; p256dh: string; auth: string };

export type WebPushResult = {
  ok: boolean;
  status: number;
  // The browser has dropped this subscription; delete it.
  gone: boolean;
};

export const sendWebPush = async (
  subscription: WebPushSubscription,
  payload: unknown,
  keys: VapidKeys,
  options: { subject: string; ttlSeconds: number },
): Promise<WebPushResult> => {
  if (!isPushServiceUrl(subscription.endpoint)) return { ok: false, status: 0, gone: true };
  const body = await encryptPayload(
    JSON.stringify(payload),
    subscription.p256dh,
    subscription.auth,
  );
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, keys, options.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttlSeconds),
      Urgency: 'high',
    },
    body: buf(body),
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
};
