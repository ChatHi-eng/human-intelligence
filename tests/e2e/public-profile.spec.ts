import { expect, test, type Page } from '@playwright/test';

// The public shareable expert profile: /expert/[id] with NO session at all —
// no fake auth token is seeded, so the page runs exactly like a stranger
// clicking a LinkedIn-bio link on app.palamapp.com. Supabase REST calls are
// answered from fixtures shaped like what the 0016 anon RLS policies return
// (approved expert row, reviews with a null reviewer embed). The spec also
// guards the privacy contract: the expert_profiles query must never select
// the vetting columns resume_url / application_goal.

const EXPERT_ID = '22222222-2222-4222-8222-222222222222';

const nowIso = new Date().toISOString();

const expertRow = {
  profile_id: EXPERT_ID,
  status: 'approved',
  linkedin_url: null,
  industry_id: 'coders',
  headline: 'Staff engineer — ship your first app',
  hourly_rate_cents: 12000,
  years_experience: 12,
  verified: true,
  cover_image_url: null,
  rating_average: 4.8,
  rating_count: 1,
  how_i_can_help: 'Twenty minutes with me saves you a weekend of wrong turns. Bring your repo.',
  stripe_connect_account_id: null,
  stripe_connect_payouts_enabled: false,
  created_at: nowIso,
  updated_at: nowIso,
  profiles: {
    id: EXPERT_ID,
    display_name: 'Priya Example',
    avatar_url: null,
    bio: 'Building things since 2014.',
    created_at: nowIso,
    updated_at: nowIso,
  },
  credentials: [],
  availability_windows: [],
  availability_dates: [],
};

// What anon actually gets back for reviews: the reviewer's profiles embed is
// null (customers are not approved experts, so the 0016 profiles policy hides
// them) — the UI must fall back to "Customer".
const reviewRow = {
  id: '33333333-3333-4333-8333-333333333333',
  booking_id: '44444444-4444-4444-8444-444444444444',
  customer_id: '55555555-5555-4555-8555-555555555555',
  expert_profile_id: EXPERT_ID,
  rating: 5,
  comment: 'Unblocked me in one call.',
  created_at: nowIso,
  profiles: null,
};

const mockPublicRoutes = async (page: Page, expertSelects: string[]) => {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/rest/v1/reviews**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([reviewRow]),
    }),
  );
  await page.route('**/rest/v1/expert_profiles**', (route) => {
    const request = route.request();
    expertSelects.push(new URL(request.url()).searchParams.get('select') ?? '');
    // maybeSingle() asks for a bare object; list queries get an array.
    const wantsObject = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wantsObject ? expertRow : [expertRow]),
    });
  });
};

test.use({ viewport: { width: 420, height: 900 } });

test('signed-out visitor sees the full profile with the invite-only CTA', async ({ page }) => {
  const expertSelects: string[] = [];
  await mockPublicRoutes(page, expertSelects);

  await page.goto(`/expert/${EXPERT_ID}`);

  // Full public surface renders without any auth token.
  await expect(page.getByText('Priya Example').first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Staff engineer — ship your first app').first()).toBeVisible();
  await expect(page.getByText(/saves you a weekend/).first()).toBeVisible();
  await expect(page.getByText('Unblocked me in one call.').first()).toBeVisible();
  // Anonymous reviewer fallback (profiles embed is null for anon).
  await expect(page.getByText('Customer').first()).toBeVisible();

  // The Book bar is replaced by the invite-only CTA.
  await expect(page.getByText('Palam is invite-only for now')).toBeVisible();
  await expect(page.getByText('Visit palamapp.com')).toBeVisible();
  await expect(page.getByText('Book session')).toHaveCount(0);

  // No redirect to onboarding: the auth guard lets /expert/[id] through.
  expect(page.url()).toContain(`/expert/${EXPERT_ID}`);

  // Privacy contract: the anon-visible query never selects vetting columns.
  expect(expertSelects.length).toBeGreaterThan(0);
  for (const sel of expertSelects) {
    expect(sel).not.toContain('resume_url');
    expect(sel).not.toContain('application_goal');
    expect(sel).not.toContain('*');
  }

  await page.screenshot({
    path: 'tests/e2e/screenshots/public-expert-profile.png',
    fullPage: true,
  });
});
