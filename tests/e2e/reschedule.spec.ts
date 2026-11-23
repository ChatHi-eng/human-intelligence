import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Moving a booking instead of cancelling it.
//
//   A customer picks another of the expert's open times, free, until 24 hours
//   before the start.
//   An expert suggests up to three times; the customer picks one or keeps the
//   original.
//   A booking can be moved twice.
//   An expert paused by Palam is told so and cannot switch themselves back on.
//
// The rules themselves are enforced in the database (migration 0032) and were
// checked there directly. Here Supabase is stubbed and the screens are driven.

const NOW_ISO = new Date().toISOString();
const ME = '00000000-0000-4000-8000-0000000000f7';
const OTHER = '00000000-0000-4000-8000-0000000000f8';
const BOOKING = '00000000-0000-4000-8000-0000000b00f7';
const PROPOSAL = '00000000-0000-4000-8000-0000000c00f7';

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
  as: 'customer' | 'expert';
  startsInHours: number;
  rescheduleCount?: number;
  // Times the expert has suggested and the customer has not answered.
  proposalInHours?: number[];
  pausedByPalam?: boolean;
};

type Calls = { rpc: { name: string; body: Record<string, unknown> }[] };

const setUp = async (page: Page, setup: Setup): Promise<Calls> => {
  const env = readEnv();
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const session = {
    access_token: 'reschedule-spec-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'reschedule-spec-refresh',
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
  const expertId = isExpert ? ME : OTHER;
  // On the hour, so it lines up with the expert's half-hour grid.
  const hour = new Date();
  hour.setMinutes(0, 0, 0);
  const start = hour.getTime() + setup.startsInHours * 3_600_000;
  const booking: Record<string, unknown> = {
    id: BOOKING,
    customer_id: isExpert ? OTHER : ME,
    expert_profile_id: expertId,
    start_at: new Date(start).toISOString(),
    end_at: new Date(start + 30 * 60_000).toISOString(),
    medium: 'video',
    status: 'confirmed',
    payment_status: 'captured',
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
    reschedule_count: setup.rescheduleCount ?? 0,
    previous_start_at: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    customer: { display_name: isExpert ? 'Casey Rivera' : 'Me Myself', avatar_url: null },
  };
  // Open every day, all day, so there is always another time to pick.
  const windows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    id: `w${weekday}`,
    expert_profile_id: expertId,
    weekday,
    start_minute: 0,
    end_minute: 1440,
    kind: 'session',
  }));
  const expertRow = {
    profile_id: expertId,
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
    paused: Boolean(setup.pausedByPalam),
    palam_paused_at: setup.pausedByPalam ? NOW_ISO : null,
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
    stripe_connect_account_id: 'acct_sample',
    stripe_connect_payouts_enabled: true,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    profiles: { id: expertId, display_name: 'Ana Morales', avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO },
    credentials: [],
    availability_windows: windows,
    availability_dates: [],
  };
  let proposal: Record<string, unknown> | null = setup.proposalInHours
    ? {
        id: PROPOSAL,
        booking_id: BOOKING,
        options: setup.proposalInHours.map((h) => new Date(hour.getTime() + h * 3_600_000).toISOString()),
        created_at: NOW_ISO,
      }
    : null;

  const calls: Calls = { rpc: [] };
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/token') ? json(route, session) : json(route, {}),
  );
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET'
      ? json(route, wantsObject(route) ? null : [])
      : route.fulfill({ status: 204, body: '' }),
  );
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = route.request().url().split('/rpc/')[1]!.split('?')[0]!;
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    if (name === 'expert_busy_times') {
      return json(route, [{ start_at: booking.start_at, end_at: booking.end_at }]);
    }
    calls.rpc.push({ name, body });
    if (name === 'reschedule_booking' || (name === 'respond_to_reschedule' && body.p_choice)) {
      const moved = String(name === 'reschedule_booking' ? body.p_start : body.p_choice);
      booking.previous_start_at = booking.start_at;
      booking.start_at = moved;
      booking.end_at = new Date(new Date(moved).getTime() + 30 * 60_000).toISOString();
      booking.reschedule_count = Number(booking.reschedule_count) + 1;
    }
    if (name === 'respond_to_reschedule' || name === 'withdraw_reschedule') proposal = null;
    if (name === 'propose_reschedule') {
      proposal = { id: PROPOSAL, booking_id: BOOKING, options: body.p_options, created_at: NOW_ISO };
    }
    return json(route, name === 'reschedule_booking' ? booking.start_at : null);
  });
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
  await page.route('**/rest/v1/bookings*', (route) =>
    json(route, wantsObject(route) ? booking : [booking]),
  );
  await page.route('**/rest/v1/reschedule_proposals*', (route) =>
    json(route, wantsObject(route) ? proposal : proposal ? [proposal] : []),
  );
  await page.route('**/functions/v1/push', (route) => json(route, { publicKey: 'BFake' }));
  return calls;
};

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' });

test('a customer moves a booking to another open time, free', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'customer', startsInHours: 72 });

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Need a different time?', { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText(/It's free until 24\s+hours before the start/)).toBeVisible();
  await page.getByText('Change time', { exact: true }).click();

  await expect(page.getByText('Pick a new time', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/reschedule/${BOOKING}$`));
  await expect(page.getByText(/Choose another of Ana Morales's open times\. It costs nothing/)).toBeVisible();
  await expect(page.getByText('Your session is now', { exact: true })).toBeVisible();
  // Nothing is moved until a time is chosen.
  await expect(page.getByText('Move my booking', { exact: true })).toBeVisible();

  const firstTime = page.getByText(/^\d{1,2}:\d{2} (AM|PM)$/).first();
  await firstTime.click();
  await page.screenshot({ path: 'tests/e2e/screenshots/reschedule-customer.png', fullPage: true });
  await page.getByText(/^Move to /).click();

  await expect.poll(() => calls.rpc).toHaveLength(1);
  expect(calls.rpc[0]!.name).toBe('reschedule_booking');
  expect(calls.rpc[0]!.body.p_booking).toBe(BOOKING);
  const movedTo = new Date(String(calls.rpc[0]!.body.p_start)).getTime();
  expect(movedTo).toBeGreaterThan(Date.now());
  await expect(page.getByText('Your booking is moved')).toBeVisible();

  // Back on the booking, which shows where it came from.
  await expect(page).toHaveURL(new RegExp(`/booking/${BOOKING}$`));
  await expect(page.getByText(/^Moved from /).last()).toBeVisible({ timeout: 30_000 });
});

test('inside 24 hours a customer cannot move it themselves', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'customer', startsInHours: 5 });

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Need a different time?', { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText(/too late to\s+move this one yourself/)).toBeVisible();
  await expect(page.getByText('Change time', { exact: true })).toHaveCount(0);

  // Going straight to the address does not get around it.
  await page.goto(`/reschedule/${BOOKING}`);
  await expect(page.getByText('It is too late to move this one')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Pick a time', { exact: true })).toHaveCount(0);
  expect(calls.rpc).toHaveLength(0);
});

test('a booking that has been moved twice cannot be moved again', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await setUp(page, { as: 'customer', startsInHours: 72, rescheduleCount: 2 });

  await page.goto(`/booking/${BOOKING}`);
  await expect(
    page.getByText('A booking can be moved 2 times, and this one has been.'),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Change time', { exact: true })).toHaveCount(0);
  await page.goto(`/reschedule/${BOOKING}`);
  await expect(page.getByText('This booking has reached its limit')).toBeVisible({ timeout: 90_000 });
});

test('an expert suggests up to three new times instead of cancelling', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  // Five hours out: too late to cancel without it counting, not too late to move.
  const calls = await setUp(page, { as: 'expert', startsInHours: 5 });

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText("Can't make this time?", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page.getByText(/If Casey Rivera picks\s+one, the session moves and nothing goes on your record\./),
  ).toBeVisible();

  // The cancel sheet points at the better option too.
  await page.getByText('Cancel booking', { exact: true }).click();
  await expect(page.getByText('Cancel with less than 24 hours to go?', { exact: true })).toBeVisible();
  await page.getByText('Suggest a new time instead', { exact: true }).click();

  await expect(page.getByText(/^Choose up to 3 times you can do\./)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`/reschedule/${BOOKING}$`));
  const times = page.getByText(/^\d{1,2}:\d{2} (AM|PM)$/);
  await times.nth(0).click();
  await times.nth(1).click();
  await times.nth(2).click();
  // A fourth is refused.
  await times.nth(3).click();
  await expect(page.getByText('You can suggest up to 3 times')).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/reschedule-expert.png', fullPage: true });
  await page.getByText('Send 3 times to Casey Rivera', { exact: true }).click();

  await expect.poll(() => calls.rpc).toHaveLength(1);
  expect(calls.rpc[0]!.name).toBe('propose_reschedule');
  expect(calls.rpc[0]!.body.p_booking).toBe(BOOKING);
  expect(calls.rpc[0]!.body.p_options).toHaveLength(3);
  await expect(page.getByText('Sent to Casey Rivera')).toBeVisible();

  // Back on the booking: waiting on the customer, and it can be taken back.
  await expect(page.getByText(/Casey Rivera has not answered yet/)).toBeVisible({ timeout: 30_000 });
  await page.getByText('Take my suggestion back', { exact: true }).click();
  await expect.poll(() => calls.rpc.map((c) => c.name)).toEqual(['propose_reschedule', 'withdraw_reschedule']);
  await expect(page.getByText('Suggestion taken back')).toBeVisible();
});

test('a customer accepts one of the times an expert suggested', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'customer', startsInHours: 5, proposalInHours: [30, 54] });

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Ana Morales asked to move this session', { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText(/Nothing changes unless you pick\s+one, and it costs nothing to move\./)).toBeVisible();
  await expect(page.getByText('Keep the original time', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/reschedule-proposal.png', fullPage: true });

  // The two suggested times are the two buttons above "Keep the original time".
  const card = page.getByText('Ana Morales asked to move this session', { exact: true }).locator('..');
  const options = card.getByText(/ • \d{1,2}:\d{2} (AM|PM)$/);
  await expect(options).toHaveCount(2);
  await options.nth(1).click();

  await expect.poll(() => calls.rpc).toHaveLength(1);
  expect(calls.rpc[0]!.name).toBe('respond_to_reschedule');
  expect(calls.rpc[0]!.body.p_proposal).toBe(PROPOSAL);
  expect(new Date(String(calls.rpc[0]!.body.p_choice)).getTime()).toBeGreaterThan(Date.now() + 50 * 3_600_000);
  await expect(page.getByText('Your booking is moved')).toBeVisible();
  await expect(page.getByText('Ana Morales asked to move this session', { exact: true })).toHaveCount(0);
});

test('a customer can keep the original time', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const calls = await setUp(page, { as: 'customer', startsInHours: 5, proposalInHours: [30] });

  await page.goto(`/booking/${BOOKING}`);
  await expect(page.getByText('Ana Morales asked to move this session', { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByText('Keep the original time', { exact: true }).click();
  await expect.poll(() => calls.rpc).toHaveLength(1);
  expect(calls.rpc[0]).toEqual({
    name: 'respond_to_reschedule',
    body: { p_proposal: PROPOSAL, p_choice: null },
  });
  await expect(page.getByText('Keeping the original time')).toBeVisible();
  await expect(page.getByText('Ana Morales asked to move this session', { exact: true })).toHaveCount(0);
});

test('an expert paused by Palam is told why and cannot switch back on', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!readEnv()?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  await setUp(page, { as: 'expert', startsInHours: 72, pausedByPalam: true });

  await page.goto('/studio');
  await expect(page.getByText('Palam has paused your profile', { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText(/repeated cancellations with less than 24 hours to go/)).toBeVisible();
  await expect(page.getByText(/Write to info@palamapp\.com/)).toBeVisible();
  // The ordinary "switch back on" shortcut is not offered.
  await expect(page.getByText('Go to Availability to switch back on')).toHaveCount(0);
  await page.screenshot({ path: 'tests/e2e/screenshots/paused-by-palam.png', fullPage: true });

  await page.goto('/studio/availability');
  await expect(
    page.getByText('Palam paused your profile, so this switch is locked until Palam lifts it.'),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByLabel('Pause my profile')).toBeDisabled();
});
