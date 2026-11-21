import { defineConfig, devices } from '@playwright/test';

// Takes a phone-sized screenshot of every page of the app for the "every page"
// review file. Not part of the test suite: run it on its own with
//   npx playwright test -c playwright.gallery.config.ts
// The backend is stubbed, so the pictures show sample people, not real data.
const port = Number(process.env.E2E_PORT ?? 8081);

export default defineConfig({
  testDir: './tests/gallery',
  outputDir: './tests/gallery/.results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `npx expo start --web --offline --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
