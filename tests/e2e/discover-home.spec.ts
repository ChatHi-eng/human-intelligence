import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// The customer home screen with enough experts to show every section: the
// guided "What do you need help with?" step, the themed rows, and the request
// form when a search finds nobody. Supabase is stubbed at the network level.

const USER_ID = '00000000-0000-4000-8000-0000000000c1';
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
  access_token: 'discover-spec-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'discover-spec-refresh-token',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'customer@palam.test',
    created_at: NOW_ISO,
    app_metadata: { provider: 'email' },
    user_metadata: {},
  },
};

// Open every day, 9 to 5 UTC, so each expert always has a next opening.
const everyDay = (expertId: string) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    id: `${expertId}-w${weekday}`,
    expert_profile_id: expertId,
    weekday,
    start_minute: 540,
    end_minute: 1020,
    kind: 'session',
  }));

const expert = (
  n: number,
  name: string,
  industryId: string,
  title: string,
  topics: string[],
  open = true,
) => {
  const id = `00000000-0000-4000-8000-00000000e00${n}`;
  return {
    profile_id: id,
    status: 'approved',
    linkedin_url: null,
    industry_id: industryId,
    industry_custom: null,
    current_title: title,
    current_company: null,
    topics,
    timezone: 'UTC',
    paused: false,
    buffer_minutes: 0,
    auto_accept: true,
    intro_enabled: false,
    intro_weekly_limit: 3,
    headline: `${title} who has done it for years`,
    hourly_rate_cents: 5000 + n * 1000,
    years_experience: 5 + n,
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
      id,
      display_name: name,
      avatar_url: null,
      bio: null,
      created_at: NOW_ISO,
      updated_at: NOW_ISO,
    },
    credentials: [],
    availability_windows: open ? everyDay(id) : [],
    availability_dates: [],
  };
};

const experts = [
  expert(1, 'Ana Lawyer', 'lawyers', 'Employment Lawyer', ['Severance', 'Non-competes']),
  expert(2, 'Ben Lawyer', 'lawyers', 'Startup Lawyer', ['Fundraising terms']),
  expert(3, 'Cy Lawyer', 'lawyers', 'Immigration Lawyer', ['Work visas'], false),
  expert(4, 'Di Coder', 'coders', 'Staff Engineer', ['System design', 'Code reviews']),
  expert(5, 'Eli Coder', 'coders', 'Mobile Engineer', ['React Native']),
  expert(6, 'Flo Coder', 'coders', 'Data Engineer', ['Pipelines']),
];

const stub = async (page: Page) => {
  const requests: { need?: string; searched?: string }[] = [];
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/token') ? json(route, session) : json(route, {}),
  );
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET' ? json(route, []) : route.fulfill({ status: 204, body: '' }),
  );
  await page.route('**/rest/v1/profiles*', (route) =>
    json(route, [
      { id: USER_ID, display_name: 'Casey', avatar_url: null, bio: null, created_at: NOW_ISO, updated_at: NOW_ISO },
    ]),
  );
  await page.route('**/rest/v1/expert_profiles*', (route) => {
    const request = route.request();
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    // The signed-in customer has no expert profile of their own.
    if (wantsObject) return json(route, null);
    const field = new URL(request.url()).searchParams.get('industry_id')?.replace('eq.', '');
    return json(route, field ? experts.filter((e) => e.industry_id === field) : experts);
  });
  await page.route('**/functions/v1/request-expert', (route) => {
    requests.push(route.request().postDataJSON() as { need?: string; searched?: string });
    return json(route, { ok: true });
  });
  return requests;
};

test.use({ viewport: { width: 390, height: 844 } });

test('customer is guided to a few experts, and can ask when nobody matches', async ({ page }) => {
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];

  const requests = await stub(page);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );
  const shot = (name: string) => page.screenshot({ path: `tests/e2e/screenshots/${name}.png` });

  await page.goto('/');
  await expect(page.getByText('What do you need help with?')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Available this week')).toBeVisible();
  await expect(page.getByText('All experts')).toBeVisible();
  await shot('home-guided');

  // Two taps: a field, then a topic. The expert who lists the topic comes
  // first, with the reason spelled out.
  const guided = page.getByText('What do you need help with?').locator('..');
  await guided.getByText('Law', { exact: false }).first().click();
  await expect(page.getByText('Which part of it?')).toBeVisible();
  await page.getByText('Severance', { exact: true }).click();
  await expect(page.getByText('3 people to talk to')).toBeVisible();
  await expect(page.getByText('Lists "Severance" as something to ask about')).toBeVisible();
  // The lawyer with no open times is still offered, clearly marked, and last.
  await expect(page.getByText('No open times right now')).toBeVisible();
  await shot('home-guided-result');
  await page.getByText('Start over').click();
  await expect(page.getByText('Which part of it?')).toHaveCount(0);

  // Searching hides the home sections and shows the list.
  const search = page.getByPlaceholder('Search by expertise, name…');
  await search.fill('react');
  await expect(page.getByText('What do you need help with?')).toHaveCount(0);
  await expect(page.getByText('Eli Coder')).toBeVisible();

  // A search nobody matches becomes a request to the team.
  await search.fill('beekeeping');
  await expect(page.getByText('No one matches yet. Tell us what you need')).toBeVisible();
  await page
    .getByPlaceholder(/selling a small business/)
    .fill('I keep bees and want advice on selling honey at markets.');
  await page.getByText('Send request', { exact: true }).click();
  await expect(page.getByText('Got it')).toBeVisible();
  expect(requests).toEqual([
    { need: 'I keep bees and want advice on selling honey at markets.', searched: 'beekeeping' },
  ]);
  await shot('home-request');
});
