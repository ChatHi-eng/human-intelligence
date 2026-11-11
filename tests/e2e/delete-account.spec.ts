import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// Renders the signed-in You tab and the delete-account confirmation screen by
// seeding a structurally valid but cryptographically bogus Supabase session
// into localStorage. Every backend query then fails with 401 and the authStore
// falls back to its synth profile — which is exactly what this test needs: the
// signed-in UI renders without real credentials, and the armed delete button
// could never delete anything even if clicked.

const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const readSupabaseRef = (): string | null => {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const match = fs
    .readFileSync(envPath, 'utf8')
    .match(/EXPO_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match?.[1] ?? null;
};

test('delete-account confirmation gates the red button on typing DELETE', async ({ page }) => {
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
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(String(key), String(value));
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)],
  );

  // The You tab, signed in — the quiet entry sits below Sign out.
  await page.goto('/profile');
  const entry = page.getByText('Delete account', { exact: true });
  await expect(entry).toBeVisible({ timeout: 90_000 });
  await entry.click();

  // Confirmation screen: the red button stays off until the user types DELETE.
  await expect(page.getByText('Delete your account', { exact: true })).toBeVisible();
  const label = page.getByText('Delete my account', { exact: true });
  await expect(label).toBeVisible();
  const disabledWrapper = label.locator('xpath=ancestor-or-self::*[@aria-disabled="true"][1]');
  await expect(disabledWrapper).toHaveCount(1);

  await page.getByPlaceholder('DELETE').fill('DELETE');
  await expect(disabledWrapper).toHaveCount(0);

  await page.screenshot({
    path: 'tests/e2e/screenshots/delete-account.png',
    fullPage: true,
  });
});
