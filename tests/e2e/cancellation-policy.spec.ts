import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Cancellation & no-show policy UI, rendered with the same fake-session trick
// as delete-account.spec.ts, plus route mocks for the booking row itself:
// every /rest/v1/bookings call is answered from a fixture, every other
// backend call fails and falls back (expert name renders as "the expert").
// Nothing real can be cancelled or reported — there is no real booking.

const FAKE_USER_ID = '00000000-0000-4000-8000-000000000000';
const EXPERT_ID = '11111111-1111-4111-8111-111111111111';

const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const readSupabaseRef = (): string | null => {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const match = fs
    .readFileSync(envPath, 'utf8')
    .match(/EXPO_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match?.[1] ?? null;
};

const seedFakeSession = async (page: Page, ref: string) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();
  const user = {
    id: FAKE_USER_ID,
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
};

type BookingFixture = Record<string, unknown>;

const bookingFixture = (overrides: Partial<BookingFixture>): BookingFixture => {
  const nowIso = new Date().toISOString();
  return {
    id: 'replaced-below',
    customer_id: FAKE_USER_ID,
    expert_profile_id: EXPERT_ID,
    medium: 'video',
    status: 'confirmed',
    payment_status: 'captured',
    price_cents: 5000,
    call_room_url: null,
    cancellation_reason: null,
    stripe_payment_intent_id: 'pi_playwright_fake',
    no_show_reported_by: null,
    no_show_reported_at: null,
    created_at: nowIso,
    updated_at: nowIso,
    ...overrides,
  };
};

// Answers booking GETs from the fixture and records PATCHes (the no-show
// report) by mutating it, so the refetch after the report sees the new state.
const mockBookingRoutes = async (page: Page, fixture: BookingFixture) => {
  // Everything else on the REST API fails fast → queries fall back cleanly.
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/rest/v1/bookings**', (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      Object.assign(fixture, body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: fixture.id }]),
      });
    }
    // maybeSingle() asks for a bare object; list queries get an array.
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wantsObject ? fixture : [fixture]),
    });
  });
};

test.use({ viewport: { width: 420, height: 900 } });

test('customer inside 24h sees the no-refund warning before cancelling', async ({ page }) => {
  const ref = readSupabaseRef();
  test.skip(!ref, 'No EXPO_PUBLIC_SUPABASE_URL in .env — the signed-in UI cannot render');

  const inTwoHours = new Date(Date.now() + 2 * 3_600_000);
  const fixture = bookingFixture({
    id: 'a0000000-0000-4000-8000-00000000c24h',
    start_at: inTwoHours.toISOString(),
    end_at: new Date(inTwoHours.getTime() + 30 * 60_000).toISOString(),
  });
  await seedFakeSession(page, ref!);
  await mockBookingRoutes(page, fixture);

  await page.goto(`/booking/${fixture.id}`);

  // Honest copy shown BEFORE cancelling, and the button says what it does.
  await expect(page.getByText('Need to cancel?', { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page.getByText(/Less than 24 hours to go\. Cancelling now isn't refunded/),
  ).toBeVisible();
  await expect(page.getByText('Cancel anyway (no refund)', { exact: true })).toBeVisible();
  // The policy line is stated in the card too.
  await expect(page.getByText(/free until 24 hours before/)).toBeVisible();

  await page.screenshot({
    path: 'tests/e2e/screenshots/cancel-inside-24h.png',
    fullPage: true,
  });
});

test('either party can report a no-show once, with inline confirmation', async ({ page }) => {
  const ref = readSupabaseRef();
  test.skip(!ref, 'No EXPO_PUBLIC_SUPABASE_URL in .env — the signed-in UI cannot render');

  // Session ended ~10 minutes ago → inside the start+10min…start+72h window.
  const started = new Date(Date.now() - 40 * 60_000);
  const fixture = bookingFixture({
    id: 'b0000000-0000-4000-8000-0000000noshw',
    status: 'completed',
    start_at: started.toISOString(),
    end_at: new Date(started.getTime() + 30 * 60_000).toISOString(),
  });
  await seedFakeSession(page, ref!);
  await mockBookingRoutes(page, fixture);

  await page.goto(`/booking/${fixture.id}`);

  // The quiet entry point…
  const entry = page.getByText("Didn't happen? Report a no-show");
  await expect(entry).toBeVisible({ timeout: 90_000 });
  await entry.click();

  // …inline confirmation: a plain statement of who didn't show, no form maze.
  await expect(page.getByText('Report a no-show', { exact: true })).toBeVisible();
  await expect(page.getByText(/You're reporting that .* didn't join this session/)).toBeVisible();
  await page.screenshot({
    path: 'tests/e2e/screenshots/report-no-show-confirm.png',
    fullPage: true,
  });

  // Send it → the PATCH lands on the fixture → UI flips to the received state.
  await page.getByText('Send report', { exact: true }).click();
  await expect(page.getByText('Report received', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/A human reviews every report within 48 hours/).first()).toBeVisible();
  // One report per booking: the entry point is gone.
  await expect(page.getByText("Didn't happen? Report a no-show")).toHaveCount(0);

  await page.screenshot({
    path: 'tests/e2e/screenshots/report-no-show-received.png',
    fullPage: true,
  });
});
