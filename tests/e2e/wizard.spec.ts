import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Expert-application wizard walkthrough. The wizard sits behind the AuthGate
// and (deliberately) has no mock mode in the app, so this spec stubs the
// Supabase layer at the NETWORK level: a seeded localStorage session plus
// route mocks for auth/rest/storage. No real backend row is ever touched —
// the spec proves the wizard's flow, gating, and copy, not the database.

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
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
  route.fulfill({
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const session = {
  access_token: 'wizard-spec-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'wizard-spec-refresh-token',
  user: {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'expert@palam.test',
    created_at: NOW_ISO,
    app_metadata: { provider: 'email' },
    user_metadata: {},
  },
};

const profileRow = {
  id: TEST_USER_ID,
  display_name: 'Test Expert',
  avatar_url: null,
  bio: null,
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
};

const stubSupabase = async (page: Page) => {
  // Catch-alls first — Playwright matches routes newest-first, so the more
  // specific profiles route below wins when it applies.
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/token')
      ? json(route, session)
      : json(route, {}),
  );
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return json(route, []);
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  });
  await page.route('**/storage/v1/**', (route) =>
    json(route, { Key: `resumes/${TEST_USER_ID}/resume.pdf` }),
  );
  await page.route('**/rest/v1/profiles*', (route) => {
    if (route.request().method() === 'GET') return json(route, [profileRow]);
    return route.fulfill({ status: 204, body: '' });
  });
};

// Phone-ish portrait — the shape the wizard is designed for.
test.use({ viewport: { width: 390, height: 844 } });

test('expert application wizard walks all six steps and submits', async ({ page }) => {
  const env = readEnv();
  test.skip(!env?.EXPO_PUBLIC_SUPABASE_URL, 'No .env — app boots to the Setup screen');
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];

  await stubSupabase(page);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );

  const shot = (name: string) =>
    page.screenshot({ path: `tests/e2e/screenshots/${name}.png` });
  const next = () => page.getByText('Next', { exact: true }).click();

  // ---- Step 1 · Field --------------------------------------------------
  await page.goto('/expert-onboarding');
  await expect(page.getByText(/What.s your field\?/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Step 1 of 6 · Field')).toBeVisible();
  // Applications are written with an upsert; keep the body to check the new
  // v3 fields actually reach the database call.
  let submitted: Record<string, unknown> | null = null;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/rest/v1/expert_profiles')) {
      const body: unknown = req.postDataJSON();
      submitted = (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
    }
  });

  // The full list is there, not the old eight.
  await expect(page.getByText('Finance & Investing', { exact: true })).toBeVisible();
  await expect(page.getByText('Real Estate', { exact: true })).toBeVisible();
  // A field we don't list: search finds nothing, "Something else" picks up
  // what was typed.
  const search = page.getByPlaceholder(/Search fields/);
  await search.fill('Beekeeping');
  await expect(page.getByText('Software Engineering', { exact: true })).toBeHidden();
  await page.getByText('Something else', { exact: true }).click();
  await expect(page.getByPlaceholder(/Veterinary medicine/)).toHaveValue('Beekeeping');
  await shot('wizard-1b-custom-field');
  // Searching narrows the list to a listed field.
  await search.fill('soft');
  await expect(page.getByText('Real Estate', { exact: true })).toBeHidden();
  await page.getByText('Software Engineering', { exact: true }).click();
  await search.fill('');
  await shot('wizard-1-field');
  await next();

  // ---- Step 2 · Experience (proof gate: LinkedIn OR resume) -------------
  await expect(page.getByText('Your background')).toBeVisible();
  await page.getByPlaceholder('e.g. Senior Product Designer').fill('Staff Engineer');
  await page.getByPlaceholder('e.g. Acme, or Self-employed').fill('Acme');
  await page.getByPlaceholder('10').fill('12');
  await next(); // no LinkedIn, no resume → blocked
  await expect(page.getByText('Add your LinkedIn or a resume')).toBeVisible();
  await page.getByPlaceholder('https://linkedin.com/in/you').fill('https://linkedin.com/in/test-expert');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Upload your resume').click();
  await (await chooser).setFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'),
  });
  await expect(page.getByText('resume.pdf')).toBeVisible();
  // The toast slides offscreen after ~4s but stays in the DOM (so no
  // toBeHidden) — wait it out for a clean screenshot.
  await page.waitForTimeout(4500);
  await shot('wizard-2-experience');
  await next();

  // ---- Step 3 · Pitch ----------------------------------------------------
  await expect(page.getByText('Your pitch')).toBeVisible();
  await page
    .getByPlaceholder('One sentence on what you offer')
    .fill('Staff engineer for 1:1 code reviews and career calls');
  await page
    .getByPlaceholder(/Who are you for/)
    .fill('I help engineers level up:\n• Code & architecture reviews\n• Career strategy calls');
  const topic = page.getByPlaceholder('e.g. Portfolio reviews');
  await topic.fill('Code reviews');
  await page.getByText('Add', { exact: true }).click();
  await topic.fill('System design');
  await topic.press('Enter');
  await expect(page.getByText(/Code reviews\s+✕/)).toBeVisible();
  await expect(page.getByText(/System design\s+✕/)).toBeVisible();
  await shot('wizard-3-pitch');
  await next();

  // ---- Step 4 · Rate (suggested range + preset chips) --------------------
  await expect(page.getByText(/Typical for Software Engineering/)).toBeVisible();
  await page.getByText('$175', { exact: true }).click();
  await shot('wizard-4-rate');
  await next();

  // ---- Step 5 · Photo (skippable) ----------------------------------------
  await expect(page.getByText('Add a profile photo')).toBeVisible();
  await shot('wizard-5-photo');
  await next();

  // ---- Step 6 · Review & submit ------------------------------------------
  await expect(page.getByText('Before you submit')).toBeVisible();
  await expect(page.getByText('Staff Engineer · 12 yrs · LinkedIn ✓ · Resume ✓')).toBeVisible();
  await expect(page.getByText('$175/hr')).toBeVisible();
  await expect(page.getByText('Code reviews, System design')).toBeVisible();
  await expect(page.getByText('What expertise do you have to offer?')).toBeVisible();
  await page
    .getByPlaceholder(/15 years shipping consumer products/)
    .fill('Fifteen years building backend systems. I help engineers with code reviews and career moves.');
  await shot('wizard-6-review');
  await page.getByText('Submit application', { exact: true }).click();

  // ---- Received ------------------------------------------------------------
  await expect(page.getByText('Application received')).toBeVisible();
  expect(submitted).toMatchObject({
    industry_id: 'coders',
    industry_custom: null,
    current_title: 'Staff Engineer',
    current_company: 'Acme',
    topics: ['Code reviews', 'System design'],
  });
  await shot('wizard-7-received');
});
