import { expect, test } from '@playwright/test';

// Single smoke test — proves the app boots through the AuthGate to a real screen.
// Whether the user lands on the onboarding screen (Supabase configured) or the
// 'Setup needed' fallback (no env vars), both prove that React Native Web,
// expo-router, Zustand hydrate, and the theme system are all functional.
test('app boots and renders the first screen', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');

  // Wait for either canonical first-screen state. The 60s timeout covers the
  // cold Metro web bundle build.
  await expect(
    page.getByText(/Talk to a human who knows|Setup needed/i).first(),
  ).toBeVisible({ timeout: 90_000 });

  await page.screenshot({
    path: 'tests/e2e/screenshots/smoke-home.png',
    fullPage: true,
  });

  // No uncaught page-level JS errors.
  expect(pageErrors, `pageerrors:\n${pageErrors.join('\n')}`).toHaveLength(0);

  // Console errors — filter known noisy categories that don't reflect app bugs.
  const meaningful = consoleErrors.filter(
    (msg) =>
      !/^Warning:/i.test(msg) &&
      !/Download the React DevTools/i.test(msg) &&
      !/Reanimated/i.test(msg) &&
      !/source map/i.test(msg) &&
      !/Failed to load resource.*favicon/i.test(msg),
  );
  expect(meaningful, `console errors:\n${meaningful.join('\n')}`).toHaveLength(0);
});
