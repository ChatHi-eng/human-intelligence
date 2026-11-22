import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  b64url,
  encryptPayload,
  fromB64url,
  generateVapidKeys,
  isPushServiceUrl,
  vapidAuthorization,
} from '../../supabase/functions/_shared/webpush';

// Notifications on the device itself.
//
// 1. The server's message encryption, decrypted here the way a browser does.
// 2. Turning notifications on, testing them and turning them off, from the
//    account screen. The device's subscription is stored, and removed.
// 3. The offer to turn them on after booking, and "Not now".
// 4. An iPhone browser tab, which cannot get notifications until Palam is on
//    the Home Screen, is told how.
// 5. Signing out stops this device getting that person's notifications.
//
// Supabase and the browser's push service are stubbed; nothing real is sent.
// (A real notification through Google's push service was checked by hand.)

const NOW_ISO = new Date().toISOString();
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/fake-device-1';

const readEnv = (): Record<string, string> | null => {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return null;
  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const wantsObject = (route: Route) =>
  (route.request().headers().accept ?? '').includes('vnd.pgrst.object');

const ME = '00000000-0000-4000-8000-0000000000c1';
const EXPERT = '00000000-0000-4000-8000-0000000000c2';
const BOOKING = '00000000-0000-4000-8000-0000000b00c1';

type Calls = {
  saved: Record<string, unknown>[];
  deleted: string[];
  pushActions: string[];
  timezones: string[];
  order: string[];
};

// What a browser with push looks like to the app, without a real push service.
const fakeBrowserPush = (opts: { capable: boolean; granted: boolean; endpoint: string }) => {
  if (!opts.capable) {
    // An iPhone browser tab: none of the push APIs exist.
    delete (window as unknown as Record<string, unknown>).PushManager;
    delete (window as unknown as Record<string, unknown>).Notification;
    return;
  }
  let permission = opts.granted ? 'granted' : 'default';
  type Sub = {
    endpoint: string;
    options: { applicationServerKey: unknown };
    toJSON: () => unknown;
    unsubscribe: () => Promise<boolean>;
  };
  let sub: Sub | null = null;
  const w = window as unknown as Record<string, number>;
  const makeSub = (key: unknown): Sub => ({
    endpoint: opts.endpoint,
    options: { applicationServerKey: key },
    toJSON: () => ({ endpoint: opts.endpoint, keys: { p256dh: 'BFakeP256dh', auth: 'fakeAuth' } }),
    unsubscribe: async () => {
      sub = null;
      return true;
    },
  });
  const registration = {
    pushManager: {
      getSubscription: async () => sub,
      subscribe: async (o: { applicationServerKey: unknown }) => {
        sub = makeSub(o.applicationServerKey);
        return sub;
      },
    },
  };
  class FakeNotification {
    static get permission() {
      return permission;
    }
    static async requestPermission() {
      w.__asked = (w.__asked ?? 0) + 1;
      permission = 'granted';
      return permission;
    }
  }
  Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      getRegistration: async () => registration,
      register: async () => registration,
      ready: Promise.resolve(registration),
    },
    configurable: true,
  });
  if (!('PushManager' in window)) {
    (window as unknown as Record<string, unknown>).PushManager = function PushManager() {};
  }
};

const setUp = async (
  page: Page,
  opts: { capable?: boolean; granted?: boolean } = {},
): Promise<Calls> => {
  const env = readEnv();
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const session = {
    access_token: 'notifications-spec-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'notifications-spec-refresh',
    user: {
      id: ME,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'casey@example.com',
      created_at: NOW_ISO,
      app_metadata: { provider: 'email' },
      user_metadata: {},
    },
  };
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );
  await page.addInitScript(fakeBrowserPush, {
    capable: opts.capable ?? true,
    granted: opts.granted ?? false,
    endpoint: ENDPOINT,
  });

  const calls: Calls = { saved: [], deleted: [], pushActions: [], timezones: [], order: [] };
  const keys = await generateVapidKeys();

  await page.route('**/auth/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/logout')) {
      calls.order.push('logout');
      return route.fulfill({ status: 204, body: '' });
    }
    return url.includes('/token') ? json(route, session) : json(route, {});
  });
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET'
      ? json(route, wantsObject(route) ? null : [])
      : route.fulfill({ status: 204, body: '' }),
  );
  await page.route('**/rest/v1/rpc/**', (route) => json(route, []));
  await page.route('**/rest/v1/profiles*', (route) => {
    const row = { id: ME, display_name: 'Casey Rivera', avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO };
    return json(route, wantsObject(route) ? row : [row]);
  });
  await page.route('**/rest/v1/notification_prefs*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      const body = request.postDataJSON() as { timezone?: string };
      if (body.timezone) calls.timezones.push(body.timezone);
      return route.fulfill({ status: 204, body: '' });
    }
    const row = { email_reminders: true, sms_reminders: false, phone: null, phone_verified_at: null };
    return json(route, wantsObject(route) ? row : [row]);
  });
  await page.route('**/rest/v1/push_tokens*', (route) => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      calls.deleted.push(decodeURIComponent(request.url()));
      calls.order.push('forget-device');
    } else if (request.method() === 'POST') {
      calls.saved.push(request.postDataJSON() as Record<string, unknown>);
    }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/functions/v1/push', (route) => {
    const body = route.request().postDataJSON() as { action?: string };
    calls.pushActions.push(body.action ?? '');
    if (body.action === 'key') return json(route, { publicKey: keys.publicKey });
    return json(route, { delivered: 1 });
  });
  return calls;
};

// A confirmed session two days out, booked by the signed-in customer.
const stubBooking = async (page: Page) => {
  const start = Date.now() + 2 * 24 * 60 * 60_000;
  const booking = {
    id: BOOKING,
    customer_id: ME,
    expert_profile_id: EXPERT,
    start_at: new Date(start).toISOString(),
    end_at: new Date(start + 30 * 60_000).toISOString(),
    medium: 'video',
    status: 'confirmed',
    payment_status: 'captured',
    price_cents: 9000,
    call_room_url: null,
    cancellation_reason: null,
    decline_reason: null,
    customer_note: 'My offer letter has a non-compete I do not understand.',
    booking_mode: 'instant',
    kind: 'session',
    requested_at: null,
    stripe_payment_intent_id: 'pi_sample',
    no_show_reported_by: null,
    no_show_reported_at: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    customer: { display_name: 'Casey Rivera', avatar_url: null },
  };
  const expertRow = {
    profile_id: EXPERT,
    status: 'approved',
    linkedin_url: null,
    industry_id: 'lawyers',
    industry_ids: ['lawyers'],
    industry_custom: null,
    location: null,
    current_title: 'Employment Lawyer',
    current_company: null,
    topics: [],
    timezone: 'UTC',
    paused: false,
    buffer_minutes: 0,
    auto_accept: true,
    intro_enabled: false,
    intro_weekly_limit: 3,
    headline: 'Read your offer with someone who writes them',
    hourly_rate_cents: 9000,
    years_experience: 14,
    verified: true,
    cover_image_url: null,
    rating_average: 0,
    rating_count: 0,
    how_i_can_help: null,
    stripe_connect_account_id: null,
    stripe_connect_payouts_enabled: false,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    profiles: { id: EXPERT, display_name: 'Ana Morales', avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO },
    credentials: [],
    availability_windows: [],
    availability_dates: [],
  };
  await page.route('**/rest/v1/bookings*', (route) =>
    json(route, wantsObject(route) ? booking : [booking]),
  );
  await page.route('**/rest/v1/expert_profiles*', (route) => {
    const mine = route.request().url().includes(`profile_id=eq.${ME}`);
    if (mine) return json(route, wantsObject(route) ? null : []);
    return json(route, wantsObject(route) ? expertRow : [expertRow]);
  });
};

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago' });

test('a push message is encrypted the way browsers expect and signed by the server', async () => {
  // The "browser": its own key pair and secret, as in a real subscription.
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const message = JSON.stringify({ title: 'Starting in 10 minutes', body: 'Tap to join.' });

  const body = await encryptPayload(message, b64url(uaPublic), b64url(auth));

  // Decrypt it by the book (RFC 8291).
  const enc = new TextEncoder();
  // WebCrypto's types want plain ArrayBuffers behind every view.
  const bs = (bytes: Uint8Array) => bytes as unknown as BufferSource;
  const concat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => {
    const key = await crypto.subtle.importKey('raw', bs(ikm), 'HKDF', false, ['deriveBits']);
    return new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(info) }, key, len * 8),
    );
  };
  const salt = body.slice(0, 16);
  const keyLength = body[20]!;
  const asPublic = body.slice(21, 21 + keyLength);
  const asKey = await crypto.subtle.importKey('raw', bs(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256),
  );
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', bs(cek), 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(nonce) }, key, bs(body.slice(21 + keyLength))),
  );
  expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(message);
  expect(plain.at(-1)).toBe(2);

  // The sender's token names the push service and verifies with the public key.
  const keys = await generateVapidKeys();
  const header = await vapidAuthorization(ENDPOINT, keys, 'mailto:info@palamapp.com');
  const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
  const [h, c, s] = token!.split('.') as [string, string, string];
  const pub = await crypto.subtle.importKey('raw', bs(fromB64url(k!)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  expect(
    await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, bs(fromB64url(s)), bs(enc.encode(`${h}.${c}`))),
  ).toBe(true);
  expect(JSON.parse(new TextDecoder().decode(fromB64url(c))).aud).toBe('https://fcm.googleapis.com');

  // Only real browser push services are ever contacted.
  expect(isPushServiceUrl(ENDPOINT)).toBe(true);
  expect(isPushServiceUrl('https://web.push.apple.com/abc')).toBe(true);
  expect(isPushServiceUrl('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
  expect(isPushServiceUrl('https://example.com/collect')).toBe(false);
  expect(isPushServiceUrl('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
  expect(isPushServiceUrl('https://169.254.169.254/latest')).toBe(false);
});

test('notifications can be turned on, tested and turned off from the account screen', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page);

  await page.goto('/profile-edit');
  await expect(page.getByText('Session reminders', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText('We remind you a day before, an hour before and ten minutes before every confirmed session.'),
  ).toBeVisible();
  await expect(page.getByText('Bookings and session reminders, sent to this device.')).toBeVisible();

  // Loading the app notes this device's time zone, and asks for nothing.
  await expect.poll(() => calls.timezones).toContain('America/Chicago');
  expect(await page.evaluate(() => (window as unknown as { __asked?: number }).__asked ?? 0)).toBe(0);
  expect(calls.saved).toHaveLength(0);

  // On: the browser is asked once, and the subscription is stored for this person.
  await page.getByText('Turn on', { exact: true }).click();
  await expect(page.getByText(/^On for this device\./)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __asked?: number }).__asked)).toBe(1);
  expect(calls.saved.at(-1)).toMatchObject({
    token: ENDPOINT,
    user_id: ME,
    platform: 'web',
    p256dh: 'BFakeP256dh',
    auth: 'fakeAuth',
  });
  await page.screenshot({ path: 'tests/e2e/screenshots/notifications-settings-on.png', fullPage: true });

  // A test notification goes to this person's own devices.
  await page.getByText('Send a test', { exact: true }).click();
  await expect(page.getByText('Test sent')).toBeVisible();
  expect(calls.pushActions).toContain('test');

  // Off: the stored subscription is removed.
  await page.getByText('Turn off', { exact: true }).click();
  await expect(page.getByText('Bookings and session reminders, sent to this device.')).toBeVisible();
  expect(calls.deleted.at(-1)).toContain(`token=eq.${ENDPOINT}`);
});

test('after booking, the booking screen offers reminders on this device', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page);
  await stubBooking(page);

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Get a reminder before it starts')).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText('Palam can remind you on this device a day before, an hour before and ten minutes before the start.'),
  ).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/notifications-prompt.png', fullPage: true });

  await page.getByText('Turn on notifications', { exact: true }).click();
  await expect(page.getByText('Notifications are on for this device')).toBeVisible();
  await expect(page.getByText('Get a reminder before it starts')).toHaveCount(0);
  expect(calls.saved.at(-1)).toMatchObject({ token: ENDPOINT, user_id: ME, platform: 'web' });
});

test('"Not now" puts the offer away, and it stays away', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page);
  await stubBooking(page);

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Get a reminder before it starts')).toBeVisible({ timeout: 90_000 });
  await page.getByText('Not now', { exact: true }).click();
  await expect(page.getByText('Get a reminder before it starts')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Ana Morales').first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Get a reminder before it starts')).toHaveCount(0);
  expect(calls.saved).toHaveLength(0);
});

test('an iPhone browser tab is told to add Palam to the Home Screen first', async ({ browser }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await setUp(page, { capable: false });
  await stubBooking(page);

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Get a reminder before it starts')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/In Safari, tap Share, then Add to Home Screen\./)).toBeVisible();
  await expect(page.getByText('Turn on notifications', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Got it', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/notifications-iphone.png', fullPage: true });
  await context.close();
});

test('signing out stops this device getting that person’s notifications', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  // A device that already said yes: it is registered again quietly on load.
  const calls = await setUp(page, { granted: true });

  await page.goto('/profile');
  await expect(page.getByText('Sign out', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => calls.saved.length).toBeGreaterThan(0);
  expect(calls.saved.at(-1)).toMatchObject({ token: ENDPOINT, user_id: ME });
  expect(await page.evaluate(() => (window as unknown as { __asked?: number }).__asked ?? 0)).toBe(0);

  await page.getByText('Sign out', { exact: true }).first().click();
  await expect(page.getByText('Sign out?', { exact: true })).toBeVisible();
  await page.getByText('Sign out', { exact: true }).last().click();
  await expect.poll(() => calls.order).toContain('logout');
  // The device is forgotten first, while the person is still signed in.
  expect(calls.order.indexOf('forget-device')).toBeGreaterThanOrEqual(0);
  expect(calls.order.indexOf('forget-device')).toBeLessThan(calls.order.indexOf('logout'));
  expect(calls.deleted.at(-1)).toContain(`token=eq.${ENDPOINT}`);
});
