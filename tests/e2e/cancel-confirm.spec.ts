import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Nothing is cancelled on one tap. A sheet first says what will happen to the
// session, the money and the other person, and warns in red about anything
// that costs the person something:
//
//   a customer inside 24 hours     no refund
//   an expert inside 24 hours      a late cancellation on their record
//
// Supabase is stubbed at the network level; nothing real is cancelled.

const NOW_ISO = new Date().toISOString();
const ME = '00000000-0000-4000-8000-0000000000e1';
const OTHER = '00000000-0000-4000-8000-0000000000e2';
const BOOKING = '00000000-0000-4000-8000-0000000b00e1';

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

type Setup = {
  // Which side of the booking the signed-in person is on.
  as: 'customer' | 'expert';
  startsInHours: number;
  status?: 'confirmed' | 'requested';
  paymentStatus?: string;
  // Late cancellations already on the expert's record.
  lateCancellations?: number;
};

type Calls = {
  patches: Record<string, unknown>[];
  responded: Record<string, unknown>[];
  refunds: number;
};

const setUp = async (page: Page, setup: Setup): Promise<Calls> => {
  const env = readEnv();
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const session = {
    access_token: 'cancel-spec-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'cancel-spec-refresh',
    user: {
      id: ME,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'me@example.com',
      created_at: NOW_ISO,
      app_metadata: { provider: 'email' },
      user_metadata: {},
    },
  };
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );

  const isExpert = setup.as === 'expert';
  const start = Date.now() + setup.startsInHours * 3_600_000;
  const booking: Record<string, unknown> = {
    id: BOOKING,
    customer_id: isExpert ? OTHER : ME,
    expert_profile_id: isExpert ? ME : OTHER,
    start_at: new Date(start).toISOString(),
    end_at: new Date(start + 30 * 60_000).toISOString(),
    medium: 'video',
    status: setup.status ?? 'confirmed',
    payment_status: setup.paymentStatus ?? 'captured',
    price_cents: 9000,
    call_room_url: null,
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
    customer: { display_name: isExpert ? 'Casey Rivera' : 'Me Myself', avatar_url: null },
  };
  const expertRow = {
    profile_id: isExpert ? ME : OTHER,
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
    profiles: {
      id: isExpert ? ME : OTHER,
      display_name: 'Ana Morales',
      avatar_url: null,
      bio: null,
      created_at: NOW_ISO,
      updated_at: NOW_ISO,
    },
    credentials: [],
    availability_windows: [],
    availability_dates: [],
  };

  const calls: Calls = { patches: [], responded: [], refunds: 0 };
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
    const row = {
      id: ME,
      display_name: isExpert ? 'Ana Morales' : 'Me Myself',
      avatar_url: null,
      bio: null,
      created_at: NOW_ISO,
      updated_at: NOW_ISO,
    };
    return json(route, wantsObject(route) ? row : [row]);
  });
  await page.route('**/rest/v1/expert_profiles*', (route) => {
    const mine = route.request().url().includes(`profile_id=eq.${ME}`);
    if (mine && !isExpert) return json(route, wantsObject(route) ? null : []);
    return json(route, wantsObject(route) ? expertRow : [expertRow]);
  });
  await page.route('**/rest/v1/bookings*', (route) => {
    const request = route.request();
    // The count of late cancellations: a HEAD request answered in a header.
    if (request.url().includes('expert_late_cancel=eq.true')) {
      const n = setup.lateCancellations ?? 0;
      return route.fulfill({
        status: 200,
        headers: {
          'content-range': n > 0 ? `0-${n - 1}/${n}` : '*/0',
          'access-control-expose-headers': 'content-range',
        },
        body: '',
      });
    }
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      calls.patches.push(body);
      Object.assign(booking, body);
      return route.fulfill({ status: 204, body: '' });
    }
    return json(route, wantsObject(route) ? booking : [booking]);
  });
  await page.route('**/functions/v1/respond-to-booking', (route) => {
    calls.responded.push(route.request().postDataJSON() as Record<string, unknown>);
    booking.status = 'cancelled';
    return json(route, { ok: true, status: 'cancelled', paymentStatus: 'refunded' });
  });
  await page.route('**/functions/v1/refund-booking', (route) => {
    calls.refunds += 1;
    return json(route, { ok: true });
  });
  await page.route('**/functions/v1/push', (route) => json(route, { publicKey: 'BFake' }));
  return calls;
};

test.use({ viewport: { width: 390, height: 844 } });

test('a customer inside 24 hours is told there is no refund, and can back out', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'customer', startsInHours: 3 });

  await page.goto(`/booking/${BOOKING}`);
  const open = page.getByText('Cancel anyway (no refund)', { exact: true });
  await expect(open).toBeVisible({ timeout: 90_000 });
  await open.click();

  await expect(page.getByText('Cancel with no refund?', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Your session with Ana Morales on .* will be cancelled, and Ana Morales will be told\./),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Your session starts in less than 24 hours, so the $90 you paid is not refunded. It goes to Ana Morales. Cancelling is free up to 24 hours before the start.',
    ),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/screenshots/cancel-sheet-customer-late.png' });
  // Opening the sheet cancels nothing, and inside 24 hours there is no moving it.
  expect(calls.patches).toHaveLength(0);
  await expect(page.getByText('Change the time instead', { exact: true })).toHaveCount(0);

  // Backing out is one tap and changes nothing.
  await page.getByText('Keep my session', { exact: true }).click();
  await expect(page.getByText('Cancel with no refund?', { exact: true })).toHaveCount(0);
  expect(calls.patches).toHaveLength(0);

  // Going through with it cancels, and asks for no refund.
  await open.click();
  await page.getByText('Cancel, no refund', { exact: true }).click();
  await expect.poll(() => calls.patches).toHaveLength(1);
  expect(calls.patches[0]).toMatchObject({
    status: 'cancelled',
    cancellation_reason: 'cancelled by customer inside 24h, payment forfeited per policy',
  });
  await expect(page.getByText('Booking cancelled')).toBeVisible();
  expect(calls.refunds).toBe(0);
});

test('a customer with more than 24 hours to go is told they get a full refund', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'customer', startsInHours: 72 });

  await page.goto(`/booking/${BOOKING}`);
  const open = page.getByText('Cancel booking', { exact: true });
  await expect(open).toBeVisible({ timeout: 90_000 });
  await open.click();

  await expect(page.getByText('Cancel this session?', { exact: true })).toBeVisible();
  await expect(
    page.getByText('You get a full refund of $90. It can take 5 to 10 business days to reach your card.'),
  ).toBeVisible();
  await expect(page.getByText(/not refunded/)).toHaveCount(0);
  // With time to spare, moving it is offered before cancelling it.
  await expect(page.getByText('Change the time instead', { exact: true })).toBeVisible();

  await page.getByText('Cancel session', { exact: true }).click();
  await expect.poll(() => calls.patches).toHaveLength(1);
  expect(calls.patches[0]).toMatchObject({ status: 'cancelled', cancellation_reason: 'cancelled by customer' });
  await expect.poll(() => calls.refunds).toBe(1);
});

test('a customer taking back an unanswered request is told they pay nothing', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, {
    as: 'customer',
    startsInHours: 72,
    status: 'requested',
    paymentStatus: 'authorized',
  });

  await page.goto(`/booking/${BOOKING}`);
  const open = page.getByText('Withdraw request', { exact: true });
  await expect(open).toBeVisible({ timeout: 90_000 });
  await open.click();
  await expect(page.getByText('Withdraw this request?', { exact: true })).toBeVisible();
  await expect(page.getByText('You pay nothing. The hold on your card is released.')).toBeVisible();
  expect(calls.patches).toHaveLength(0);
  await page.getByText('Keep my request', { exact: true }).click();
  await expect(page.getByText('Withdraw this request?', { exact: true })).toHaveCount(0);
});

test('an expert inside 24 hours is warned it goes on their record', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'expert', startsInHours: 3, lateCancellations: 1 });

  await page.goto(`/booking/${BOOKING}`);
  const open = page.getByText('Cancel booking', { exact: true });
  await expect(open).toBeVisible({ timeout: 90_000 });
  // Said on the card too, before the sheet.
  await expect(
    page.getByText(/Less than 24 hours to go\. Cancelling now counts as a late cancellation on your\s+record\./),
  ).toBeVisible();
  await open.click();

  await expect(page.getByText('Cancel with less than 24 hours to go?', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Your session with Casey Rivera on .* will be cancelled, and they will be told right away\./),
  ).toBeVisible();
  await expect(
    page.getByText('Casey Rivera is refunded in full, and you are not paid for this session.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'This close to the start, it counts as a late cancellation, and it would be number 2 in 90 days. Your profile will be paused: you keep the sessions you already have, but nobody can book you until Palam lifts it.',
    ),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/screenshots/cancel-sheet-expert-late.png' });
  // The sheet offers the way out that costs them nothing.
  await expect(page.getByText('Suggest a new time instead', { exact: true })).toBeVisible();
  expect(calls.responded).toHaveLength(0);

  await page.getByText('Keep session', { exact: true }).click();
  await expect(page.getByText('Cancel with less than 24 hours to go?', { exact: true })).toHaveCount(0);
  expect(calls.responded).toHaveLength(0);

  await open.click();
  await page.getByText('Cancel anyway', { exact: true }).click();
  await expect.poll(() => calls.responded).toHaveLength(1);
  expect(calls.responded[0]).toMatchObject({ bookingId: BOOKING, action: 'decline' });
  await expect(page.getByText('Booking cancelled')).toBeVisible();
});

test('an expert with more than 24 hours to go gets no late-cancellation warning', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'expert', startsInHours: 72 });

  await page.goto(`/booking/${BOOKING}`);
  const open = page.getByText('Cancel booking', { exact: true });
  await expect(open).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/late cancellation/)).toHaveCount(0);
  await open.click();

  await expect(page.getByText('Cancel this session?', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Casey Rivera is refunded in full, and you are not paid for this session.'),
  ).toBeVisible();
  await expect(
    page.getByText('They planned around this time, so please cancel only if you have to.'),
  ).toBeVisible();
  await expect(page.getByText(/late cancellation/)).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/screenshots/cancel-sheet-expert-early.png' });
  expect(calls.responded).toHaveLength(0);
});

test('an expert with no late cancellations is told where the limit is', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await setUp(page, { as: 'expert', startsInHours: 3, lateCancellations: 0 });

  await page.goto(`/booking/${BOOKING}`);
  const open = page.getByText('Cancel booking', { exact: true });
  await expect(open).toBeVisible({ timeout: 90_000 });
  await open.click();
  await expect(
    page.getByText(
      'This close to the start, it counts as a late cancellation on your record. At 2 within 90 days, your profile is paused until Palam has looked at it.',
    ),
  ).toBeVisible();
});
