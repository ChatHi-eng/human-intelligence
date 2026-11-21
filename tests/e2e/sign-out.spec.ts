import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// Sign out must be easy to find: on the You tab it sits next to the account's
// name and email (in view without scrolling) and again at the foot of the
// page. Either one asks once, then signs out.
//
// Uses the same bogus-session trick as delete-account.spec.ts: the signed-in
// UI renders, and no real account is touched.

const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const readSupabaseRef = (): string | null => {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const match = fs
    .readFileSync(envPath, 'utf8')
    .match(/EXPO_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match?.[1] ?? null;
};

test('sign out is in view on the You tab, asks once, then signs out', async ({ page }) => {
  test.setTimeout(120_000);
  const ref = readSupabaseRef();
  test.skip(!ref, 'No EXPO_PUBLIC_SUPABASE_URL in .env — the signed-in UI cannot render');

  const nowSec = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();
  const user = {
    id: '00000000-0000-4000-8000-000000000000',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'playwright@example.com',
    email_confirmed_at: nowIso,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
  const session = {
    access_token: [
      b64url({ alg: 'HS256', typ: 'JWT' }),
      b64url({
        sub: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email,
        iat: nowSec,
        exp: nowSec + 60 * 60 * 24 * 365,
      }),
      'playwright-fake-signature',
    ].join('.'),
    refresh_token: 'playwright-fake-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: nowSec + 60 * 60 * 24 * 365,
    user,
  };
  // Seed the session once (not on every load), so signing out sticks.
  await page.addInitScript(
    ([key, value]) => {
      if (!window.sessionStorage.getItem('seeded')) {
        window.localStorage.setItem(String(key), String(value));
        window.sessionStorage.setItem('seeded', '1');
      }
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)],
  );
  // The fake session cannot be revoked for real; answer the sign-out call.
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/profile');
  const buttons = page.getByText('Sign out', { exact: true });
  await expect(buttons.first()).toBeVisible({ timeout: 90_000 });
  // One beside the account, one at the foot of the page.
  await expect(buttons).toHaveCount(2);
  // The first is on screen without scrolling.
  await expect(buttons.first()).toBeInViewport();
  await page.screenshot({ path: 'tests/e2e/screenshots/sign-out-you-tab.png' });

  // It asks first, and backing out keeps you signed in.
  await buttons.first().click();
  await expect(page.getByText('Sign out?', { exact: true })).toBeVisible();
  await expect(page.getByText(/signed in as playwright@example\.com/)).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/sign-out-confirm.png' });
  await page.getByText('Stay signed in', { exact: true }).click();
  await expect(page.getByText('Sign out?', { exact: true })).toHaveCount(0);
  await expect(page.getByText('playwright@example.com').first()).toBeVisible();

  // The one at the foot of the page does the same, and confirming signs out.
  await buttons.last().click();
  await expect(page.getByText('Sign out?', { exact: true })).toBeVisible();
  await page.getByText('Sign out', { exact: true }).last().click();
  await expect(page).toHaveURL(/welcome/, { timeout: 30_000 });
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), `sb-${ref}-auth-token`);
  expect(stored).toBeNull();
});
