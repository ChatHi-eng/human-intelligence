import { expect, test, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 1. One-tap sign-in: a "Continue with Google" button appears on the sign-in
//    screen only when the owner has switched Google on in Supabase, and it
//    sends the browser to Google by way of Supabase.
// 2. A verified mobile number before the first booking: while the owner's
//    switch is on, the booking screen asks for a number, texts a code, and
//    only offers payment once the code is right.
//
// Supabase is stubbed at the network level; nothing real is sent.

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
const wantsObject = (route: Route) =>
  (route.request().headers().accept ?? '').includes('vnd.pgrst.object');

test.use({ viewport: { width: 390, height: 844 } });

test('Continue with Google shows only when Google is switched on, and opens Google', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');

  let external: Record<string, boolean> = { email: true, google: false, apple: false };
  await page.route('**/auth/v1/settings', (route) => json(route, { external }));

  // Off: only the email field.
  await page.goto('/login?mode=signup');
  await expect(page.getByText('Create your account', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByText('Continue with Google')).toHaveCount(0);

  // On: the button sits above the email field. Apple stays hidden until it is on too.
  external = { email: true, google: true, apple: false };
  await page.reload();
  const google = page.getByText('Continue with Google', { exact: true });
  await expect(google).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Continue with Apple')).toHaveCount(0);
  await expect(page.getByText('or use your email')).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/sign-in-google.png' });

  // Tapping it leaves for Google through Supabase, asking to come back to /auth-callback.
  await page.route('**/auth/v1/authorize**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>google stub</p>' }),
  );
  const leaving = page.waitForRequest((r) => r.url().includes('/auth/v1/authorize'));
  await google.click();
  const target = new URL((await leaving).url());
  expect(target.searchParams.get('provider')).toBe('google');
  expect(target.searchParams.get('redirect_to')).toMatch(/\/auth-callback$/);
});

test('a first booking asks for a mobile number and checks it with a texted code', async ({ page }) => {
  test.setTimeout(120_000);
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];

  const customerId = '00000000-0000-4000-8000-0000000000a1';
  const expertId = '00000000-0000-4000-8000-0000000000a2';
  const session = {
    access_token: 'phone-spec-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'phone-spec-refresh',
    user: {
      id: customerId,
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

  // Open every day, all day, so there is always a time to pick.
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
    profiles: { id: expertId, display_name: 'Ana Morales', avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO },
    credentials: [],
    availability_windows: windows,
    availability_dates: [],
  };

  // What the "database" holds about the customer's phone.
  let verifiedPhone: string | null = null;
  const calls: { action?: string; phone?: string; code?: string }[] = [];

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
    const row = { id: customerId, display_name: 'Casey Rivera', avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO };
    return json(route, wantsObject(route) ? row : [row]);
  });
  await page.route('**/rest/v1/expert_profiles*', (route) => {
    const mine = route.request().url().includes(`profile_id=eq.${customerId}`);
    if (mine) return json(route, wantsObject(route) ? null : []);
    return json(route, wantsObject(route) ? expertRow : [expertRow]);
  });
  // The owner has switched the requirement on.
  await page.route('**/rest/v1/app_config*', (route) => {
    const row = { phone_verification_required: true };
    return json(route, wantsObject(route) ? row : [row]);
  });
  await page.route('**/rest/v1/notification_prefs*', (route) => {
    const row = {
      email_reminders: true,
      sms_reminders: false,
      phone: verifiedPhone,
      phone_verified_at: verifiedPhone ? NOW_ISO : null,
    };
    return json(route, wantsObject(route) ? row : [row]);
  });
  await page.route('**/functions/v1/verify-phone', (route) => {
    const body = route.request().postDataJSON() as { action?: string; phone?: string; code?: string };
    calls.push(body);
    if (body.action === 'send') return json(route, { sent: true });
    if (body.code !== '482913') {
      return json(route, { error: 'That code is not right. Check the text and try again.' }, 400);
    }
    verifiedPhone = body.phone ?? null;
    return json(route, { verified: true });
  });

  await page.goto(`/book/${expertId}`);
  await expect(page.getByText('Pick a day')).toBeVisible({ timeout: 90_000 });
  await page.getByText(/^\d{1,2}:\d{2} (AM|PM)$/).first().click();

  // No way to pay yet: the number comes first.
  await expect(page.getByText('Verify your mobile number')).toBeVisible();
  await expect(page.getByText('Pay and book')).toHaveCount(0);

  // A number that cannot be a phone number is caught before anything is sent.
  await page.getByLabel('Mobile number').fill('555');
  await page.getByText('Text me a code', { exact: true }).click();
  await expect(page.getByText(/Enter a mobile number\./)).toBeVisible();
  expect(calls).toHaveLength(0);

  // A US number typed the usual way is sent in the international form.
  await page.getByLabel('Mobile number').fill('(415) 555-0123');
  await page.getByText('Text me a code', { exact: true }).click();
  await expect(page.getByText(/Code sent to/)).toBeVisible();
  expect(calls[0]).toEqual({ action: 'send', phone: '+14155550123' });
  await page.screenshot({ path: 'tests/e2e/screenshots/phone-verify-code.png', fullPage: true });

  // A wrong code is refused, the right one unlocks payment.
  await page.getByLabel('Code from the text message').fill('000000');
  await page.getByText('Verify number', { exact: true }).click();
  await expect(page.getByText('That code is not right. Check the text and try again.')).toBeVisible();
  await expect(page.getByText('Pay and book')).toHaveCount(0);

  await page.getByLabel('Code from the text message').fill('482913');
  await page.getByText('Verify number', { exact: true }).click();
  await expect(page.getByText('Pay and book')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Verify your mobile number')).toHaveCount(0);
  expect(calls.at(-1)).toEqual({ action: 'check', phone: '+14155550123', code: '482913' });
});
