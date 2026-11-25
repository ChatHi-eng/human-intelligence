import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { joinKey, joinPath, readJoinKey } from '../../supabase/functions/_shared/join';

// Personal join links, and the review prompt's landing.
//
// 1. A join link's key only works for the booking and the side it was made for.
// 2. /join takes someone straight into the call, signed in or not.
// 3. Opened too early, it says when the call opens.
// 4. Opened after the end, it says so.
// 5. The Join button opens Palam's join page in a new tab, which fetches
//    this person's pass and goes into the call with it.
// 5b. That page, opened signed out and without a key, asks for a sign-in.
// 5c. A session settled as a no-show says so on the booking, with the record.
// 6. The link in "How was your session?" lands on the review card.
// 7. A signed-out person who taps that link is taken there after signing in.
//
// Supabase and the video room are stubbed; nothing real is called.

const NOW_ISO = new Date().toISOString();
const ME = '00000000-0000-4000-8000-0000000000d1';
const EXPERT = '00000000-0000-4000-8000-0000000000d2';
const BOOKING = '00000000-0000-4000-8000-0000000b00d1';
const ROOM_URL = 'https://palam-test.daily.co/hi-00000000000040008000000b';

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

const session = {
  access_token: 'join-spec-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'join-spec-refresh',
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
const storageKey = () =>
  `sb-${new URL(readEnv()!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`;

// The app's Supabase calls, answered from here. `startsInMinutes` places the
// customer's confirmed session relative to now.
const stubBackend = async (
  page: Page | BrowserContext,
  opts: { startsInMinutes: number; roomUrl?: string | null; extra?: Record<string, unknown> },
) => {
  const start = Date.now() + opts.startsInMinutes * 60_000;
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
    call_room_url: opts.roomUrl ?? null,
    cancellation_reason: null,
    decline_reason: null,
    customer_note: null,
    booking_mode: 'instant',
    kind: 'session',
    requested_at: null,
    stripe_payment_intent_id: 'pi_sample',
    no_show_reported_by: null,
    no_show_reported_at: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    customer: { display_name: 'Casey Rivera', avatar_url: null },
    ...(opts.extra ?? {}),
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
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/token') ? json(route, session) : json(route, {}),
  );
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
  await page.route('**/rest/v1/bookings*', (route) =>
    json(route, wantsObject(route) ? booking : [booking]),
  );
  await page.route('**/rest/v1/expert_profiles*', (route) => {
    const mine = route.request().url().includes(`profile_id=eq.${ME}`);
    if (mine) return json(route, wantsObject(route) ? null : []);
    return json(route, wantsObject(route) ? expertRow : [expertRow]);
  });
  await page.route('**/functions/v1/push', (route) => json(route, { publicKey: 'BFake' }));
  return booking;
};

const signIn = (page: Page | BrowserContext) =>
  page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [storageKey(), JSON.stringify(session)] as const,
  );

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago' });

test('a join key works only for its own booking and its own side', async () => {
  const secret = 'server-secret-for-the-test';
  const customerKey = await joinKey(secret, BOOKING, 'customer');
  const expertKey = await joinKey(secret, BOOKING, 'expert');

  expect(customerKey).toMatch(/^c[A-Za-z0-9_-]{22}$/);
  expect(expertKey).toMatch(/^e[A-Za-z0-9_-]{22}$/);
  expect(await readJoinKey(secret, BOOKING, customerKey)).toBe('customer');
  expect(await readJoinKey(secret, BOOKING, expertKey)).toBe('expert');

  // Relabelling the customer's key as the expert's does not make it one.
  expect(await readJoinKey(secret, BOOKING, `e${customerKey.slice(1)}`)).toBeNull();
  // Another booking, another server, a damaged key, an empty key: all refused.
  expect(await readJoinKey(secret, EXPERT, customerKey)).toBeNull();
  expect(await readJoinKey('a-different-secret', BOOKING, customerKey)).toBeNull();
  expect(await readJoinKey(secret, BOOKING, customerKey.slice(0, -1))).toBeNull();
  expect(await readJoinKey(secret, BOOKING, '')).toBeNull();

  expect(joinPath(BOOKING, customerKey)).toBe(`/join?b=${BOOKING}&k=${customerKey}`);
});

test('a join link takes someone straight into the call without signing in', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await stubBackend(page, { startsInMinutes: 5 });
  const asked: unknown[] = [];
  await page.route('**/functions/v1/join-call', (route) => {
    asked.push(route.request().postDataJSON());
    return json(route, {
      status: 'ok',
      url: ROOM_URL,
      bookingId: BOOKING,
      otherName: 'Ana Morales',
      startAt: NOW_ISO,
      endAt: NOW_ISO,
      kind: 'session',
    });
  });
  await page.route(`${ROOM_URL}*`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>video room</h1>' }),
  );

  // Not signed in: the key in the link is the pass.
  await page.goto(`/join?b=${BOOKING}&k=cTestKeyTestKeyTestKey12`);
  await expect(page.getByText('video room')).toBeVisible({ timeout: 90_000 });
  expect(page.url()).toBe(ROOM_URL);
  expect(asked[0]).toEqual({ bookingId: BOOKING, key: 'cTestKeyTestKeyTestKey12' });
});

test('a join link opened too early says when the call opens', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await stubBackend(page, { startsInMinutes: 24 * 60 });
  await page.route('**/functions/v1/join-call', (route) =>
    json(route, {
      status: 'early',
      bookingId: BOOKING,
      otherName: 'Ana Morales',
      // 3:00 PM in Chicago, the browser's zone in this test.
      startAt: '2027-01-12T21:00:00.000Z',
      endAt: '2027-01-12T21:30:00.000Z',
      joinFromAt: '2027-01-12T20:45:00.000Z',
      kind: 'session',
    }),
  );

  await page.goto(`/join?b=${BOOKING}&k=cTestKeyTestKeyTestKey12`);
  await expect(page.getByText(/Your session with Ana Morales starts .* at 3:00 PM/)).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText(/You can join from 2:45 PM\./)).toBeVisible();
  await expect(page.getByText('Sign in to see my booking', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/join\?/);
  await page.screenshot({ path: 'tests/e2e/screenshots/join-early.png' });
});

test('a join link opened after the end says the call has ended', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await stubBackend(page, { startsInMinutes: -120 });
  await page.route('**/functions/v1/join-call', (route) =>
    json(route, {
      status: 'ended',
      bookingId: BOOKING,
      otherName: 'Ana Morales',
      startAt: '2027-01-12T21:00:00.000Z',
      endAt: '2027-01-12T21:30:00.000Z',
      kind: 'session',
    }),
  );

  await page.goto(`/join?b=${BOOKING}&k=cTestKeyTestKeyTestKey12`);
  await expect(page.getByText('This call has ended')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Your session with Ana Morales finished at 3:30 PM.')).toBeVisible();

  // A link that is not a real one gets a plain explanation, not an error page.
  await page.unroute('**/functions/v1/join-call');
  await page.route('**/functions/v1/join-call', (route) => json(route, { status: 'invalid' }));
  await page.goto(`/join?b=${BOOKING}&k=nonsense`);
  await expect(page.getByText('This link does not work')).toBeVisible({ timeout: 90_000 });
});

test('the Join button opens the join page, which goes into the call with a pass', async ({ page, context }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  // Everything is set up on the whole browser, because the call opens in a
  // second tab.
  await signIn(context);
  await stubBackend(context, { startsInMinutes: 5 });
  const asked: unknown[] = [];
  await context.route('**/functions/v1/join-call', (route) => {
    asked.push(route.request().postDataJSON());
    return json(route, {
      status: 'ok',
      url: `${ROOM_URL}?t=test-pass`,
      bookingId: BOOKING,
      otherName: 'Ana Morales',
      startAt: NOW_ISO,
      endAt: NOW_ISO,
      kind: 'session',
    });
  });
  await context.route(`${ROOM_URL}*`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>video room</h1>' }),
  );

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Join call', { exact: true })).toBeVisible({ timeout: 90_000 });
  const opened = page.waitForEvent('popup');
  await page.getByText('Join call', { exact: true }).click();
  const room = await opened;
  // The new tab is Palam's own page first, then the room, pass in hand.
  await expect(room.getByText('video room')).toBeVisible({ timeout: 90_000 });
  expect(room.url()).toBe(`${ROOM_URL}?t=test-pass`);
  // Signed in, so no key: the server knows who this is from the sign-in.
  expect(asked).toEqual([{ bookingId: BOOKING }]);
});

test('the join page without a key asks a signed-out person to sign in', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await stubBackend(page, { startsInMinutes: 5 });
  let asked = 0;
  await page.route('**/functions/v1/join-call', (route) => {
    asked += 1;
    return json(route, { status: 'invalid' });
  });
  await page.goto(`/join?b=${BOOKING}`);
  await expect(page.getByText('Sign in to join your call')).toBeVisible({ timeout: 90_000 });
  expect(asked).toBe(0);
});

test('a session settled as an expert no-show says so, with the record and the refund', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await signIn(page);
  const start = Date.now() - 60 * 60_000;
  const iso = (m: number) => new Date(start + m * 60_000).toISOString();
  await stubBackend(page, {
    startsInMinutes: -60,
    extra: {
      payment_status: 'refunded',
      attendance_outcome: 'expert_no_show',
      attendance_decided_at: iso(40),
      attendance_detail: {
        togetherMinutes: 0,
        spans: { customer: [[iso(2), iso(15)]], expert: [[iso(0), iso(2)]] },
      },
    },
  });
  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('This session did not happen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Ana Morales did not join\. You have been refunded in full/)).toBeVisible();
  await expect(page.getByText('Who was in the call')).toBeVisible();
  await expect(page.getByText(/^You: /)).toBeVisible();
  await expect(page.getByText(/^Ana Morales: /)).toBeVisible();
  // Settled from the record: nothing to report, and no review to leave.
  await expect(page.getByText(/Report a no-show/)).toHaveCount(0);
  await expect(page.getByText('Join call', { exact: true })).toHaveCount(0);
  await page.getByText('This session did not happen').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve(__dirname, 'screenshots/no-show-settled-customer.png') });
});

test('the review link lands on the review card', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await signIn(page);
  // The session ended an hour and a half ago.
  await stubBackend(page, { startsInMinutes: -120, roomUrl: ROOM_URL });

  await page.goto(`/booking/${BOOKING}?review=1`);
  const card = page.getByText('How was your call?');
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card).toBeInViewport();
  await expect(page.getByText('Submit review', { exact: true })).toBeInViewport();
  await page.screenshot({ path: 'tests/e2e/screenshots/review-landing.png' });
});

test('a signed-out person who taps the review link gets there after signing in', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await stubBackend(page, { startsInMinutes: -120, roomUrl: ROOM_URL });

  // Signed out: asked to sign in first.
  await page.goto(`/booking/${BOOKING}?review=1`);
  await expect(page.getByText('Talk to a human who knows.')).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/welcome$/);

  // They sign in (here: a session appears, as it does after the emailed code).
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [storageKey(), JSON.stringify(session)] as const,
  );
  await page.reload();
  await expect(page.getByText('How was your call?')).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(new RegExp(`/booking/${BOOKING}\\?review=1$`));

  // It is used once: the next sign-in goes to the home screen as usual.
  expect(await page.evaluate(() => window.localStorage.getItem('palam.returnPath'))).toBeNull();
});
