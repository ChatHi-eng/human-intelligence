import { expect, test } from '@playwright/test';

// The signed-out front door. A visitor sees what Palam is and two plain
// choices, create an account or sign in. The expert application is not
// offered here: it starts after the account exists.

test('signed-out visitors land on /welcome with create account and sign in', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const create = page.getByText('Create account', { exact: true });
  await expect(create).toBeVisible({ timeout: 90_000 });
  test.skip(
    await page.getByText('Setup needed').isVisible(),
    'No .env — app boots to the Setup screen',
  );
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible();
  await expect(page.getByText('Start your application')).toHaveCount(0);
  await page.screenshot({ path: 'tests/e2e/screenshots/welcome.png' });

  // Create account opens the emailed-code step worded for a new account.
  await create.click();
  await expect(page.getByText('Create your account', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/welcome-create-account.png' });

  // One tap switches to signing in, and back.
  await page.getByText('I already have an account', { exact: true }).click();
  await expect(page.getByText(/Enter the email you signed up with/)).toBeVisible();
  await expect(page.getByText('New here? Create an account', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/screenshots/welcome-sign-in.png' });
});

test('old /onboarding and /signup links still work', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/onboarding');
  await expect(page.getByText('Create account', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/welcome$/);

  await page.goto('/signup');
  await expect(page.getByText('Create your account', { exact: true })).toBeVisible({
    timeout: 90_000,
  });
});
