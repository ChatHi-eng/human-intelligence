import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Two things an expert and a customer both rely on:
//
// 1. Every account gives a real name. A new account is named after its email
//    address, so the app asks once before anything else.
// 2. An expert can see who they are meeting and what that person wants to
//    talk about, on Studio and on their calendar.
//
// Supabase is stubbed at the network level; no real row is touched.

const NOW_ISO = new Date().toISOString();

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

const sessionFor = (id: string, email: string) => ({
  access_token: 'expert-sessions-spec-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'expert-sessions-spec-refresh',
  user: {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    created_at: NOW_ISO,
    app_metadata: { provider: 'email' },
    user_metadata: {},
  },
});

const seed = async (page: Page, session: ReturnType<typeof sessionFor>) => {
  const env = readEnv();
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/token') ? json(route, session) : json(route, {}),
  );
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET'
      ? json(route, (route.request().headers().accept ?? '').includes('vnd.pgrst.object') ? null : [])
      : route.fulfill({ status: 204, body: '' }),
  );
};

test.use({ viewport: { width: 390, height: 844 } });

test('a new account is asked for a real name once, then lands on the home screen', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');

  const id = '00000000-0000-4000-8000-0000000000f1';
  await seed(page, sessionFor(id, 'jordan.lee88@example.com'));
  // The name a brand-new account starts with: the first half of its email.
  let name = 'jordan.lee88';
  let saved: Record<string, unknown> | null = null;
  await page.route('**/rest/v1/profiles*', (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      saved = request.postDataJSON() as Record<string, unknown>;
      name = String(saved.display_name);
      return route.fulfill({ status: 204, body: '' });
    }
    const row = { id, display_name: name, avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO };
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    return json(route, wantsObject ? row : [row]);
  });

  // Wherever they try to go, they are asked first.
  await page.goto('/bookings');
  await expect(page.getByText("What's your name?")).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/your-name$/);

  // Both names are needed.
  await page.getByLabel('First name').fill('Jordan');
  await page.getByText('Continue', { exact: true }).click();
  await expect(page.getByText('Enter your first and last name.')).toBeVisible();

  await page.getByLabel('Last name').fill('Lee');
  await page.screenshot({ path: 'tests/e2e/screenshots/your-name.png' });
  await page.getByText('Continue', { exact: true }).click();
  await expect.poll(() => saved).toMatchObject({ display_name: 'Jordan Lee' });

  // Then the home screen, and it does not ask again.
  await expect(page.getByText('Talk to a human')).toBeVisible({ timeout: 30_000 });
  await page.goto('/bookings');
  await expect(page.getByText('Your bookings')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("What's your name?")).toHaveCount(0);
});

test('an expert sees who they are meeting and what it is about', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');

  const expertId = '00000000-0000-4000-8000-0000000000f2';
  await seed(page, sessionFor(expertId, 'dana@example.com'));
  const profileRow = { id: expertId, display_name: 'Dana Okafor', avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO };
  const expertRow = {
    profile_id: expertId,
    status: 'approved',
    linkedin_url: null,
    industry_id: 'product-designers',
    industry_ids: ['product-designers', 'career'],
    industry_custom: null,
    location: 'Austin, TX',
    current_title: 'Senior Product Designer',
    current_company: null,
    topics: ['Portfolio reviews'],
    timezone: 'America/Chicago',
    paused: false,
    buffer_minutes: 0,
    auto_accept: true,
    intro_enabled: false,
    intro_weekly_limit: 3,
    headline: 'Portfolio reviews for people breaking in',
    hourly_rate_cents: 7500,
    years_experience: 15,
    verified: true,
    cover_image_url: null,
    rating_average: 0,
    rating_count: 0,
    how_i_can_help: null,
    stripe_connect_account_id: null,
    stripe_connect_payouts_enabled: false,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    profiles: profileRow,
    credentials: [],
    availability_windows: [],
    availability_dates: [],
  };
  // A session a customer booked and paid for, starting shortly.
  const start = Date.now() + 20 * 60_000;
  const booking = {
    id: '00000000-0000-4000-8000-0000000b00f2',
    customer_id: '00000000-0000-4000-8000-0000000000f3',
    expert_profile_id: expertId,
    start_at: new Date(start).toISOString(),
    end_at: new Date(start + 30 * 60_000).toISOString(),
    medium: 'video',
    status: 'confirmed',
    payment_status: 'captured',
    price_cents: 7500,
    call_room_url: null,
    cancellation_reason: null,
    decline_reason: null,
    customer_note: 'I am moving from graphic design into product design.',
    booking_mode: 'instant',
    kind: 'session',
    requested_at: null,
    stripe_payment_intent_id: 'pi_sample',
    no_show_reported_by: null,
    no_show_reported_at: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    customer: { display_name: 'Jordan Lee', avatar_url: null },
  };
  await page.route('**/rest/v1/profiles*', (route) =>
    json(route, (route.request().headers().accept ?? '').includes('vnd.pgrst.object') ? profileRow : [profileRow]),
  );
  await page.route('**/rest/v1/expert_profiles*', (route) =>
    json(route, (route.request().headers().accept ?? '').includes('vnd.pgrst.object') ? expertRow : [expertRow]),
  );
  await page.route('**/rest/v1/bookings*', (route) => {
    const url = route.request().url();
    // Nothing is waiting for an answer; the session is already confirmed.
    if (url.includes('status=eq.requested')) return json(route, []);
    return json(route, (route.request().headers().accept ?? '').includes('vnd.pgrst.object') ? booking : [booking]);
  });

  // Studio lists it under upcoming sessions, with the customer's name and note.
  await page.goto('/studio');
  await expect(page.getByText('Upcoming sessions')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Jordan Lee')).toBeVisible();
  await expect(page.getByText('I am moving from graphic design into product design.')).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/studio-upcoming.png', fullPage: true });

  // The calendar names the customer too, not the expert.
  await page.goto('/studio/calendar');
  await expect(page.getByText("Tap a day to see who you're meeting.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Jordan Lee')).toBeVisible();
  await expect(page.getByText('What they want to talk about')).toBeVisible();

  // Their own profile shows every field and where they are based.
  await page.goto(`/expert/${expertId}`);
  await expect(page.getByText('Product & UX Design · Career & Job Search')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Austin, TX')).toBeVisible();
});
