import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// An approved expert sets up a week of hours, takes a day off, and sees
// themselves on Discover with a next-available date. Supabase is stubbed at
// the network level (same approach as wizard.spec), so no real row is touched.

const EXPERT_ID = '00000000-0000-4000-8000-0000000000aa';
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

const session = {
  access_token: 'availability-spec-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'availability-spec-refresh-token',
  user: {
    id: EXPERT_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'expert@palam.test',
    created_at: NOW_ISO,
    app_metadata: { provider: 'email' },
    user_metadata: {},
  },
};

const profileRow = {
  id: EXPERT_ID,
  display_name: 'Dana Example',
  avatar_url: null,
  bio: null,
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
};

type WindowRow = { weekday: number; start_minute: number; end_minute: number; kind?: string };

const stubSupabase = async (page: Page) => {
  // What the "database" currently holds; saving replaces it.
  const state: {
    windows: WindowRow[];
    timezone: string | null;
    paused: boolean;
    buffer_minutes: number;
    auto_accept: boolean;
    intro_enabled: boolean;
    intro_weekly_limit: number;
  } = {
    windows: [],
    timezone: null,
    paused: false,
    buffer_minutes: 0,
    auto_accept: true,
    intro_enabled: false,
    intro_weekly_limit: 3,
  };

  const expertRow = () => ({
    profile_id: EXPERT_ID,
    status: 'approved',
    linkedin_url: null,
    industry_id: 'lawyers',
    industry_custom: null,
    current_title: 'Employment Lawyer',
    current_company: 'Example LLP',
    topics: ['Severance', 'Non-competes'],
    timezone: state.timezone,
    paused: state.paused,
    buffer_minutes: state.buffer_minutes,
    auto_accept: state.auto_accept,
    intro_enabled: state.intro_enabled,
    intro_weekly_limit: state.intro_weekly_limit,
    headline: 'Read your contract with someone who writes them',
    hourly_rate_cents: 20000,
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
    profiles: profileRow,
    credentials: [],
    availability_windows: state.windows.map((w, i) => ({
      id: `w${i}`,
      expert_profile_id: EXPERT_ID,
      ...w,
    })),
    availability_dates: [],
  });

  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/token') ? json(route, session) : json(route, {}),
  );
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET'
      ? json(route, [])
      : route.fulfill({ status: 204, body: '' }),
  );
  await page.route('**/rest/v1/profiles*', (route) => json(route, [profileRow]));
  await page.route('**/rest/v1/availability_windows*', (route) => {
    const request = route.request();
    // Like the real table: each save replaces only the hours of its own kind.
    const kind = new URL(request.url()).searchParams.get('kind')?.replace('eq.', '');
    if (request.method() === 'POST') {
      state.windows = [...state.windows, ...(request.postDataJSON() as WindowRow[])];
    }
    if (request.method() === 'DELETE') {
      state.windows = state.windows.filter((w) => (w.kind ?? 'session') !== kind);
    }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/rest/v1/expert_profiles*', (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      Object.assign(state, request.postDataJSON() as Partial<typeof state>);
      return route.fulfill({ status: 204, body: '' });
    }
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    if (wantsObject) return json(route, expertRow());
    // The Discover query asks for paused=eq.false, like the real database.
    const hidden = state.paused && request.url().includes('paused=eq.false');
    return json(route, hidden ? [] : [expertRow()]);
  });
  return state;
};

test.use({ viewport: { width: 390, height: 844 } });

test('expert sets weekly hours in a few taps and shows up as bookable', async ({ page }) => {
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];

  const state = await stubSupabase(page);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );
  const shot = (name: string) => page.screenshot({ path: `tests/e2e/screenshots/${name}.png` });

  // Studio tells a newly approved expert what is still missing.
  await page.goto('/studio');
  await expect(page.getByText('Finish setting up')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Open your calendar')).toBeVisible();
  await shot('studio-setup-checklist');

  // The availability screen starts empty and says so.
  await page.getByText('Set availability', { exact: true }).click();
  await expect(page.getByText('What customers see')).toBeVisible();
  await expect(page.getByText(/No open times in the next 14 days/)).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // One tap fills the working week; Friday gets a second block.
  await page.getByText('Weekdays, 9am to 5pm').click();
  await expect(page.getByText(/40 hours a week, room for 80 sessions/)).toBeVisible();
  await expect(page.getByText('You have unsaved changes.')).toBeVisible();
  await shot('availability-weekly');
  await page.getByText('Save weekly hours', { exact: true }).click();
  await expect(page.getByText('Weekly hours saved')).toBeVisible();

  // Saved as five windows, with the time zone they were typed in.
  expect(state.windows).toHaveLength(5);
  expect(state.windows[0]).toMatchObject({ weekday: 1, start_minute: 540, end_minute: 1020 });
  expect(state.timezone).toBeTruthy();
  await expect(page.getByText(/open times in the next 14 days\. The next one is/)).toBeVisible();
  await shot('availability-saved');

  // A gap between sessions is one tap and is saved straight away.
  await page.getByText('15 min', { exact: true }).click();
  await expect.poll(() => state.buffer_minutes).toBe(15);

  // Booking is instant unless the expert asks to approve requests first.
  // Approving first pushes their times out to a day's notice.
  await expect(page.getByText(/Times closer than 2 hours away/)).toBeVisible();
  await page.getByLabel('Approve requests first').click();
  await expect.poll(() => state.auto_accept).toBe(false);
  await expect(page.getByText(/Times closer than 24 hours away/)).toBeVisible();
  await page.getByLabel('Approve requests first').click();
  await expect.poll(() => state.auto_accept).toBe(true);

  // Free intro calls: off by default, with their own hours and weekly limit.
  await expect(page.getByText('Most intro calls in a week')).toHaveCount(0);
  await page.getByLabel('Offer a free 15-minute intro').click();
  await expect.poll(() => state.intro_enabled).toBe(true);
  await page.getByLabel('5 intro calls a week').click();
  await expect.poll(() => state.intro_weekly_limit).toBe(5);
  await page.getByText('Weekdays, 12pm to 1pm').click();
  await expect(page.getByText(/5 hours a week, room for 20 intro calls/)).toBeVisible();
  await page.getByText('Save intro hours', { exact: true }).click();
  await expect(page.getByText('Intro hours saved')).toBeVisible();
  // Saving intro hours leaves the five paid-session windows alone.
  expect(state.windows.filter((w) => w.kind === 'intro')).toHaveLength(5);
  expect(state.windows.filter((w) => w.kind === 'session')).toHaveLength(5);
  await shot('availability-intro');

  // Discover now shows the expert with their field, role and next opening.
  await page.goto('/');
  await expect(page.getByText('Dana Example')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Employment Lawyer at Example LLP · 14 yrs/)).toBeVisible();
  await expect(page.getByText(/Next: /)).toBeVisible();
  await expect(page.getByText('Free 15-minute intro')).toBeVisible();
  // Search matches the field name and needs every word to match.
  const search = page.getByPlaceholder('Search by expertise, name…');
  await search.fill('law severance');
  await expect(page.getByText('Dana Example')).toBeVisible();
  await search.fill('law plumbing');
  await expect(page.getByText('No one matches yet. Tell us what you need')).toBeVisible();
  await expect(search).toBeFocused();
  await shot('discover-card');

  // Pausing hides the expert from Discover and says so on their own screens.
  await page.goto('/studio/availability');
  await page.getByLabel('Pause my profile').click();
  await expect(page.getByText('Profile paused')).toBeVisible();
  await expect(page.getByText(/Your profile is paused. You are hidden from Discover/)).toBeVisible();
  expect(state.paused).toBe(true);
  await shot('availability-paused');
  await page.goto('/');
  await expect(page.getByText('Talk to a human')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Dana Example')).toHaveCount(0);
});
