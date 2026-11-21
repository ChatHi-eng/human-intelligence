import { test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Walks every page of the app as four different people (a visitor, a new
// account, a customer with bookings, an approved expert) and saves a
// phone-sized picture of each, plus a list of what was captured
// (shots/manifest.json). The backend is stubbed at the network level, so
// nothing real is read or written and the people shown are made up.

const SHOTS = path.resolve(__dirname, 'shots');
const WIDTH = 390;
const HEIGHT = 844;

type Entry = { file: string; title: string; group: string; route: string; note?: string };
let entries: Entry[] = [];

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

// ---------------------------------------------------------------- sample data

const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const NOW_ISO = iso(NOW);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// A round time of day, some days from now.
const at = (days: number, hour: number) => {
  const d = new Date(NOW + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1';
const EXPERT_ME = '00000000-0000-4000-8000-0000000000aa';
const expertId = (n: number) => `00000000-0000-4000-8000-00000000e00${n}`;

const profile = (id: string, name: string, bio: string | null = null) => ({
  id,
  display_name: name,
  avatar_url: null,
  bio,
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
});

const weekdays = (id: string, kind = 'session', start = 540, end = 1020) =>
  [1, 2, 3, 4, 5].map((weekday) => ({
    id: `${id}-${kind}-${weekday}`,
    expert_profile_id: id,
    weekday,
    start_minute: start,
    end_minute: end,
    kind,
  }));

type ExpertOptions = {
  id: string;
  name: string;
  industryId: string;
  title: string;
  company: string | null;
  headline: string;
  topics: string[];
  priceCents: number;
  years: number;
  help?: string | null;
  status?: string;
  ratingCount?: number;
  ratingAverage?: number;
  intro?: boolean;
  open?: boolean;
  payouts?: boolean;
};

const expertRow = (o: ExpertOptions) => ({
  profile_id: o.id,
  status: o.status ?? 'approved',
  linkedin_url: 'https://linkedin.com/in/example',
  industry_id: o.industryId,
  industry_custom: null,
  current_title: o.title,
  current_company: o.company,
  topics: o.topics,
  timezone: 'America/Los_Angeles',
  paused: false,
  buffer_minutes: 15,
  auto_accept: true,
  intro_enabled: Boolean(o.intro),
  intro_weekly_limit: 3,
  headline: o.headline,
  hourly_rate_cents: o.priceCents,
  years_experience: o.years,
  verified: true,
  cover_image_url: null,
  rating_average: o.ratingAverage ?? 0,
  rating_count: o.ratingCount ?? 0,
  how_i_can_help: o.help ?? null,
  stripe_connect_account_id: o.payouts ? 'acct_sample' : null,
  stripe_connect_payouts_enabled: Boolean(o.payouts),
  created_at: NOW_ISO,
  updated_at: NOW_ISO,
  profiles: profile(o.id, o.name, 'Fifteen years in the field, the last six running my own practice.'),
  credentials: [
    {
      id: `${o.id}-c1`,
      expert_profile_id: o.id,
      title: o.title,
      issuer: o.company ?? 'Self-employed',
      year: 2019,
      end_year: null,
      type: 'role',
    },
  ],
  availability_windows:
    o.open === false
      ? []
      : [...weekdays(o.id), ...(o.intro ? weekdays(o.id, 'intro', 1020, 1080) : [])],
  availability_dates: [],
});

const EXPERTS = [
  expertRow({
    id: expertId(1),
    name: 'Ana Morales',
    industryId: 'lawyers',
    title: 'Employment Lawyer',
    company: 'Morales Law',
    headline: 'Read your severance or job offer with someone who writes them',
    topics: ['Severance', 'Non-competes', 'Job offers'],
    priceCents: 9000,
    years: 14,
    help: 'Bring the document. In 30 minutes I will tell you what is normal, what is not, and what to ask for.',
    ratingCount: 6,
    ratingAverage: 4.8,
    intro: true,
    payouts: true,
  }),
  expertRow({
    id: expertId(2),
    name: 'Ben Carter',
    industryId: 'lawyers',
    title: 'Startup Lawyer',
    company: null,
    headline: 'Fundraising terms explained before you sign',
    topics: ['Fundraising terms', 'Founder agreements'],
    priceCents: 12000,
    years: 11,
  }),
  expertRow({
    id: expertId(3),
    name: 'Cy Nakamura',
    industryId: 'lawyers',
    title: 'Immigration Lawyer',
    company: null,
    headline: 'Work visas and green cards, in plain terms',
    topics: ['Work visas'],
    priceCents: 8000,
    years: 9,
    open: false,
  }),
  expertRow({
    id: expertId(4),
    name: 'Di Okonkwo',
    industryId: 'coders',
    title: 'Staff Engineer',
    company: 'Acme',
    headline: 'System design and code reviews from someone who ships',
    topics: ['System design', 'Code reviews'],
    priceCents: 7500,
    years: 12,
    intro: true,
  }),
  expertRow({
    id: expertId(5),
    name: 'Eli Brandt',
    industryId: 'coders',
    title: 'Mobile Engineer',
    company: null,
    headline: 'Get your first app into the stores',
    topics: ['React Native', 'App Store review'],
    priceCents: 6000,
    years: 8,
  }),
  expertRow({
    id: expertId(6),
    name: 'Flo Ahmed',
    industryId: 'coders',
    title: 'Data Engineer',
    company: null,
    headline: 'Pipelines that do not wake you up at night',
    topics: ['Pipelines', 'Warehouses'],
    priceCents: 7000,
    years: 10,
  }),
];

const ME_AS_EXPERT = (status: string) =>
  expertRow({
    id: EXPERT_ME,
    name: 'Dana Okafor',
    industryId: 'designers',
    title: 'Senior Product Designer',
    company: 'Self-employed',
    headline: 'Portfolio and product design reviews for people breaking in',
    topics: ['Portfolio reviews', 'Design critiques', 'Career moves'],
    priceCents: 7500,
    years: 15,
    help: 'I have hired designers for ten years. Show me your portfolio and I will tell you what a hiring manager sees in the first minute.',
    status,
    intro: true,
    payouts: status === 'approved',
  });

type BookingOptions = {
  id: string;
  customerId: string;
  customerName: string;
  expert: string;
  start: number;
  status: string;
  payment: string;
  priceCents: number;
  mode?: string;
  kind?: string;
  note?: string | null;
  reason?: string | null;
};

const bookingRow = (o: BookingOptions) => ({
  id: o.id,
  customer_id: o.customerId,
  expert_profile_id: o.expert,
  start_at: iso(o.start),
  end_at: iso(o.start + (o.kind === 'intro' ? 15 : 30) * 60_000),
  medium: 'video',
  status: o.status,
  payment_status: o.payment,
  price_cents: o.priceCents,
  call_room_url: null,
  cancellation_reason: o.reason ?? null,
  decline_reason: null,
  customer_note: o.note ?? null,
  booking_mode: o.mode ?? 'instant',
  kind: o.kind ?? 'session',
  requested_at: o.status === 'requested' ? iso(NOW - 2 * HOUR) : null,
  stripe_payment_intent_id: o.kind === 'intro' ? null : 'pi_sample',
  stripe_checkout_session_id: null,
  no_show_reported_by: null,
  no_show_reported_at: null,
  created_at: iso(NOW - 3 * DAY),
  updated_at: NOW_ISO,
  customer: { display_name: o.customerName, avatar_url: null },
});

const B = (n: number) => `00000000-0000-4000-8000-0000000b000${n}`;

const CUSTOMER_BOOKINGS = [
  bookingRow({
    id: B(1),
    customerId: CUSTOMER_ID,
    customerName: 'Casey Rivera',
    expert: expertId(1),
    start: at(3, 10),
    status: 'confirmed',
    payment: 'captured',
    priceCents: 9000,
    note: 'I was offered a severance package on Friday and have a week to sign.',
  }),
  bookingRow({
    id: B(2),
    customerId: CUSTOMER_ID,
    customerName: 'Casey Rivera',
    expert: expertId(4),
    start: at(5, 14),
    status: 'requested',
    payment: 'authorized',
    priceCents: 7500,
    mode: 'approval',
    note: 'Could you look at how I have split my services before I go further?',
  }),
  bookingRow({
    id: B(3),
    customerId: CUSTOMER_ID,
    customerName: 'Casey Rivera',
    expert: expertId(5),
    start: at(-8, 11),
    status: 'completed',
    payment: 'captured',
    priceCents: 6000,
  }),
  bookingRow({
    id: B(4),
    customerId: CUSTOMER_ID,
    customerName: 'Casey Rivera',
    expert: expertId(2),
    start: at(-3, 15),
    status: 'cancelled',
    payment: 'released',
    priceCents: 12000,
    mode: 'approval',
    reason: 'declined by expert',
  }),
];

const EXPERT_BOOKINGS = [
  bookingRow({
    id: B(5),
    customerId: CUSTOMER_ID,
    customerName: 'Casey Rivera',
    expert: EXPERT_ME,
    start: at(4, 13),
    status: 'requested',
    payment: 'authorized',
    priceCents: 7500,
    mode: 'approval',
    note: 'I am moving from graphic design into product design. Can you look at my portfolio?',
  }),
  bookingRow({
    id: B(6),
    customerId: '00000000-0000-4000-8000-0000000000c2',
    customerName: 'Jordan Lee',
    expert: EXPERT_ME,
    start: NOW + 2 * HOUR,
    status: 'confirmed',
    payment: 'captured',
    priceCents: 7500,
    note: 'Interview loop at a fintech next week, want a mock critique.',
  }),
  bookingRow({
    id: B(7),
    customerId: '00000000-0000-4000-8000-0000000000c3',
    customerName: 'Sam Patel',
    expert: EXPERT_ME,
    start: at(2, 9),
    status: 'confirmed',
    payment: 'not_required',
    priceCents: 0,
    kind: 'intro',
  }),
  ...[1, 3, 6, 9].map((daysAgo, i) =>
    bookingRow({
      id: `00000000-0000-4000-8000-0000000b001${i}`,
      customerId: `00000000-0000-4000-8000-0000000000d${i}`,
      customerName: ['Riley Chen', 'Morgan Diaz', 'Alex Kim', 'Taylor Brooks'][i] ?? 'Customer',
      expert: EXPERT_ME,
      start: at(-daysAgo, 12),
      status: 'completed',
      payment: 'captured',
      priceCents: 7500,
    }),
  ),
];

const REVIEWS = [
  {
    id: '00000000-0000-4000-8000-00000000r001',
    booking_id: B(3),
    customer_id: CUSTOMER_ID,
    expert_profile_id: expertId(1),
    rating: 5,
    comment: 'She found two clauses I would have signed without noticing. Worth every dollar.',
    created_at: iso(NOW - 6 * DAY),
    profiles: { display_name: 'Casey Rivera', avatar_url: null },
  },
  {
    id: '00000000-0000-4000-8000-00000000r002',
    booking_id: B(4),
    customer_id: '00000000-0000-4000-8000-0000000000c2',
    expert_profile_id: expertId(1),
    rating: 5,
    comment: 'Clear, fast, and told me what to ask for.',
    created_at: iso(NOW - 12 * DAY),
    profiles: null,
  },
];

// ---------------------------------------------------------------- the stub

type World = {
  // null = nobody is signed in.
  me: { id: string; email: string; name: string } | null;
  myExpert: ReturnType<typeof expertRow> | null;
  experts: ReturnType<typeof expertRow>[];
  bookings: ReturnType<typeof bookingRow>[];
};

const sessionFor = (me: NonNullable<World['me']>) => ({
  access_token: 'gallery-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'gallery-refresh-token',
  user: {
    id: me.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: me.email,
    email_confirmed_at: NOW_ISO,
    created_at: NOW_ISO,
    app_metadata: { provider: 'email' },
    user_metadata: {},
  },
});

const enter = async (page: Page, world: World) => {
  const env = readEnv();
  const ref = new URL(env!.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const wantsObject = (route: Route) =>
    (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
  const param = (route: Route, name: string) =>
    new URL(route.request().url()).searchParams.get(name);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/auth/v1/**', (route) =>
    route.request().url().includes('/token') && world.me
      ? json(route, sessionFor(world.me))
      : json(route, {}),
  );
  await page.route('**/storage/v1/**', (route) => json(route, { Key: 'sample' }));
  await page.route('**/functions/v1/**', (route) => json(route, { ok: true }));
  await page.route('**/functions/v1/sync-connect-status', (route) =>
    json(route, {
      accountId: world.myExpert?.stripe_connect_account_id ?? null,
      payoutsEnabled: Boolean(world.myExpert?.stripe_connect_payouts_enabled),
      chargesEnabled: Boolean(world.myExpert?.stripe_connect_payouts_enabled),
      detailsSubmitted: Boolean(world.myExpert?.stripe_connect_payouts_enabled),
      status: world.myExpert?.stripe_connect_payouts_enabled ? 'ready' : 'not-started',
    }),
  );
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET'
      ? json(route, wantsObject(route) ? null : [])
      : route.fulfill({ status: 204, body: '' }),
  );
  await page.route('**/rest/v1/rpc/**', (route) => json(route, []));
  await page.route('**/rest/v1/profiles*', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const row = world.me ? profile(world.me.id, world.me.name) : null;
    return json(route, wantsObject(route) ? row : row ? [row] : []);
  });
  await page.route('**/rest/v1/notification_prefs*', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const row = { email_reminders: true, sms_reminders: false, phone: null };
    return json(route, wantsObject(route) ? row : [row]);
  });
  await page.route('**/rest/v1/reviews*', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const expert = param(route, 'expert_profile_id')?.replace('eq.', '');
    const rows = REVIEWS.filter((r) => !expert || r.expert_profile_id === expert);
    if (param(route, 'booking_id')) return json(route, wantsObject(route) ? null : []);
    return json(route, wantsObject(route) ? (rows[0] ?? null) : rows);
  });
  await page.route('**/rest/v1/expert_profiles*', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const all = [...(world.myExpert ? [world.myExpert] : []), ...world.experts];
    const id = param(route, 'profile_id')?.replace('eq.', '');
    if (wantsObject(route) || id) {
      const row = all.find((e) => e.profile_id === id) ?? null;
      return json(route, wantsObject(route) ? row : row ? [row] : []);
    }
    const field = param(route, 'industry_id')?.replace('eq.', '');
    const listed = all.filter((e) => e.status === 'approved');
    return json(route, field ? listed.filter((e) => e.industry_id === field) : listed);
  });
  await page.route('**/rest/v1/bookings*', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const url = route.request().url();
    const id = param(route, 'id')?.replace('eq.', '');
    if (id) {
      const row = world.bookings.find((b) => b.id === id) ?? null;
      return json(route, wantsObject(route) ? row : row ? [row] : []);
    }
    let rows = world.bookings;
    if (url.includes('status=eq.requested')) rows = rows.filter((b) => b.status === 'requested');
    else if (url.includes('status=in.'))
      rows = rows.filter((b) => ['requested', 'confirmed', 'in_progress'].includes(b.status));
    const since = param(route, 'start_at')?.replace('gte.', '');
    if (since) rows = rows.filter((b) => b.start_at >= since);
    return json(route, wantsObject(route) ? (rows[0] ?? null) : rows);
  });

  await page.addInitScript(
    ([key, value]) => {
      if (value) window.localStorage.setItem(String(key), String(value));
      else window.localStorage.removeItem(String(key));
    },
    [`sb-${ref}-auth-token`, world.me ? JSON.stringify(sessionFor(world.me)) : ''],
  );
};

// ---------------------------------------------------------------- shooting

// Each walk numbers its own pictures (1xx, 2xx, ...) and writes its own list,
// so one walk failing or being rerun never disturbs the others.
let counter = 0;
let walk = 0;
const begin = (n: number) => {
  walk = n;
  counter = n * 100;
  entries = [];
  for (const f of fs.readdirSync(SHOTS)) {
    if (f.startsWith(String(n)) && f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
  }
};

// Lets the page settle, then grows the window to the full height of whatever
// scrolls, so the picture shows the whole page and not just the first screen.
const shot = async (page: Page, e: Omit<Entry, 'file'>, slug: string) => {
  await page.waitForTimeout(900);
  const extra = await page.evaluate(() => {
    let more = 0;
    document.querySelectorAll('*').forEach((el) => {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
        more = Math.max(more, el.scrollHeight - el.clientHeight);
      }
    });
    return more;
  });
  if (extra > 0) {
    await page.setViewportSize({ width: WIDTH, height: Math.min(HEIGHT + extra + 8, 6000) });
    await page.waitForTimeout(500);
  }
  counter += 1;
  const file = `${String(counter).padStart(3, '0')}-${slug}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) });
  entries.push({ file, ...e });
  if (extra > 0) await page.setViewportSize({ width: WIDTH, height: HEIGHT });
};

const open = async (page: Page, route: string, waitFor?: string | RegExp) => {
  await page.goto(route);
  if (waitFor) {
    await page
      .getByText(waitFor)
      .first()
      .waitFor({ state: 'visible', timeout: 90_000 })
      .catch(() => undefined);
  }
  await page.waitForTimeout(1800);
};

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

test.afterEach(() => {
  if (walk) fs.writeFileSync(path.join(SHOTS, 'manifest-' + walk + '.json'), JSON.stringify(entries, null, 2));
});

const VISITOR: World = { me: null, myExpert: null, experts: EXPERTS, bookings: [] };
const NEW_ACCOUNT: World = {
  me: { id: CUSTOMER_ID, email: 'casey@example.com', name: 'Casey Rivera' },
  myExpert: null,
  experts: EXPERTS,
  bookings: [],
};
const CUSTOMER: World = { ...NEW_ACCOUNT, bookings: CUSTOMER_BOOKINGS };
const EXPERT_PENDING: World = {
  me: { id: EXPERT_ME, email: 'dana@example.com', name: 'Dana Okafor' },
  myExpert: ME_AS_EXPERT('pending'),
  experts: EXPERTS,
  bookings: [],
};
const EXPERT: World = {
  me: { id: EXPERT_ME, email: 'dana@example.com', name: 'Dana Okafor' },
  myExpert: ME_AS_EXPERT('approved'),
  experts: EXPERTS,
  bookings: EXPERT_BOOKINGS,
};

// ---------------------------------------------------------------- the walk

test.describe('main pass', () => {

  test('1 visitor (not signed in)', async ({ page }) => {
    begin(1);
    const group = '1. Visitor, not signed in';
    await enter(page, VISITOR);

    await open(page, '/', 'Create account');
    await shot(page, { group, title: 'Welcome', route: '/welcome', note: 'The first thing anyone sees at app.palamapp.com.' }, 'welcome');

    await open(page, '/login?mode=signup', 'Create your account');
    await shot(page, { group, title: 'Create account', route: '/login?mode=signup' }, 'create-account');

    await open(page, '/login?mode=signin', 'Send code');
    await shot(page, { group, title: 'Sign in', route: '/login?mode=signin' }, 'sign-in');

    await page.getByPlaceholder('you@example.com').fill('casey@example.com');
    await page.getByText('Send code', { exact: true }).click();
    await page.getByText('Enter your code').waitFor({ timeout: 30_000 }).catch(() => undefined);
    await shot(page, { group, title: 'Enter your code', route: '/login', note: 'Shown after "Send code".' }, 'enter-code');

    await open(page, `/expert/${expertId(1)}`, 'Ana Morales');
    await shot(page, { group, title: 'Expert profile, shared link', route: '/expert/[id]', note: 'What someone sees when an expert shares their profile link, without signing in.' }, 'public-expert-profile');
  });

  test('2 new account', async ({ page }) => {
    begin(2);
    const group = '2. New account (no expert application yet)';
    await enter(page, NEW_ACCOUNT);

    await open(page, '/', 'Become an expert');
    await shot(page, { group, title: 'Home, right after signing up', route: '/', note: 'Sample data with six experts. The "Become an expert" card shows until you apply.' }, 'home-new-account');

    await enter(page, { ...NEW_ACCOUNT, experts: EXPERTS.slice(0, 1) });
    await open(page, '/', 'Become an expert');
    await shot(page, { group, title: 'Home with only one expert', route: '/', note: 'Closer to the live site today: the guided step and rows only appear once there are a few experts.' }, 'home-one-expert');

    await enter(page, { ...NEW_ACCOUNT, experts: [] });
    await open(page, '/', 'No experts yet');
    await shot(page, { group, title: 'Home with no experts', route: '/' }, 'home-no-experts');

    await enter(page, NEW_ACCOUNT);
    await open(page, '/', 'Become an expert');
    const guided = page.getByText('What do you need help with?').locator('..');
    await guided.getByText('Law', { exact: false }).first().click().catch(() => undefined);
    await page.getByText('Severance', { exact: true }).click().catch(() => undefined);
    await shot(page, { group, title: 'Home, guided match result', route: '/', note: 'After two taps in "What do you need help with?".' }, 'home-guided-result');

    await open(page, '/', 'Become an expert');
    await page.getByPlaceholder('Search by expertise, name…').fill('beekeeping');
    await shot(page, { group, title: 'Search with no match', route: '/', note: 'The request is emailed to you to answer personally.' }, 'home-no-match');

    await open(page, `/expert/${expertId(1)}`, 'Ana Morales');
    await shot(page, { group, title: 'Expert profile', route: '/expert/[id]', }, 'expert-profile');

    await open(page, `/book/${expertId(1)}`, 'Pick a day');
    await shot(page, { group, title: 'Book a session: pick a time', route: '/book/[id]' }, 'book-pick-time');
    await page.getByText(/^[0-9]{1,2}:[0-9]{2} (AM|PM)$/).first().click().catch(() => undefined);
    await shot(page, { group, title: 'Book a session: time picked, ready to pay', route: '/book/[id]', note: 'The green notice shows only while payments are in test mode.' }, 'book-ready-to-pay');
    await page.getByText('Free 15-min intro', { exact: true }).click().catch(() => undefined);
    await shot(page, { group, title: 'Book a free 15-minute intro', route: '/book/[id]' }, 'book-free-intro');

    await open(page, '/bookings', 'Your bookings');
    await shot(page, { group, title: 'Bookings, empty', route: '/bookings' }, 'bookings-empty');

    await open(page, '/profile', 'Edit account');
    await shot(page, { group, title: 'You', route: '/profile' }, 'you-new-account');

    await page.getByText('Sign out', { exact: true }).first().click();
    await page.getByText('Sign out?').waitFor({ timeout: 15_000 }).catch(() => undefined);
    await shot(page, { group, title: 'Sign out confirmation', route: '/profile' }, 'sign-out');

    await open(page, '/profile-edit');
    await shot(page, { group, title: 'Edit account and reminders', route: '/profile-edit' }, 'edit-account');

    await open(page, '/delete-account', 'Delete your account');
    await shot(page, { group, title: 'Delete account', route: '/delete-account' }, 'delete-account');
  });

  test('3 applying as an expert', async ({ page }) => {
    begin(3);
    const group = '3. Applying as an expert';
    await enter(page, NEW_ACCOUNT);
    const next = () => page.getByText('Next', { exact: true }).click();
    const step = (n: number, name: string) => ({ group, title: `Application step ${n} of 6: ${name}`, route: '/expert-onboarding' });

    await open(page, '/expert-onboarding', /What.s your field\?/);
    await page.getByPlaceholder(/Search fields/).fill('design');
    await page.getByText('Product & UX Design', { exact: true }).click().catch(async () => {
      await page.getByPlaceholder(/Search fields/).fill('soft');
      await page.getByText('Software Engineering', { exact: true }).click();
    });
    await page.getByPlaceholder(/Search fields/).fill('');
    await shot(page, step(1, 'Field'), 'apply-1-field');
    await next();

    await page.getByText('Your background').waitFor();
    await page.getByPlaceholder('e.g. Senior Product Designer').fill('Senior Product Designer');
    await page.getByPlaceholder('e.g. Acme, or Self-employed').fill('Self-employed');
    await page.getByPlaceholder('10').fill('15');
    await page.getByPlaceholder('https://linkedin.com/in/you').fill('https://linkedin.com/in/dana-okafor');
    await shot(page, step(2, 'Experience'), 'apply-2-experience');
    await next();

    await page.getByText('Your pitch').waitFor();
    await page.getByPlaceholder('One sentence on what you offer').fill('Portfolio and product design reviews for people breaking in');
    await page.getByPlaceholder(/Who are you for/).fill('I have hired designers for ten years. Show me your portfolio and I will tell you what a hiring manager sees in the first minute.');
    const topic = page.getByPlaceholder('e.g. Portfolio reviews');
    await topic.fill('Portfolio reviews');
    await topic.press('Enter');
    await topic.fill('Career moves');
    await topic.press('Enter');
    await shot(page, step(3, 'Pitch'), 'apply-3-pitch');
    await next();

    await page.getByText(/per session/).first().waitFor();
    await page.getByText(/^[$][0-9]+$/).first().click();
    await shot(page, step(4, 'Rate'), 'apply-4-rate');
    await next();

    await page.getByText('Add a profile photo').waitFor();
    await shot(page, step(5, 'Photo'), 'apply-5-photo');
    await next();

    await page.getByText('Before you submit').waitFor();
    await page.getByPlaceholder(/15 years shipping consumer products/).fill('Fifteen years designing consumer products, ten of them hiring. I help people get their first product design job.');
    await shot(page, step(6, 'Review'), 'apply-6-review');
    await page.getByText('Submit application', { exact: true }).click();
    await page.getByText('Application received').waitFor({ timeout: 30_000 }).catch(() => undefined);
    await shot(page, { group, title: 'Application received', route: '/expert-onboarding' }, 'apply-7-received');

    await enter(page, EXPERT_PENDING);
    await open(page, '/studio', 'Dana Okafor');
    await shot(page, { group, title: 'Studio while the application is under review', route: '/studio' }, 'studio-pending');
    await open(page, '/profile', 'Edit account');
    await shot(page, { group, title: 'You, application under review', route: '/profile' }, 'you-pending');
  });

  test('4 customer with bookings', async ({ page }) => {
    begin(4);
    const group = '4. Customer with bookings';
    await enter(page, CUSTOMER);

    await open(page, '/bookings', 'Your bookings');
    await shot(page, { group, title: 'Bookings', route: '/bookings', }, 'bookings');

    await open(page, `/booking/${B(1)}`, 'Ana Morales');
    await shot(page, { group, title: 'Booking, confirmed and paid', route: '/booking/[id]' }, 'booking-confirmed');

    await open(page, `/booking/${B(2)}`, 'Di Okonkwo');
    await shot(page, { group, title: 'Booking, waiting for the expert (card held)', route: '/booking/[id]' }, 'booking-requested');

    await open(page, `/booking/${B(3)}`, 'Eli Brandt');
    await shot(page, { group, title: 'Booking, finished: leave a review', route: '/booking/[id]' }, 'booking-completed');

    await open(page, `/booking/${B(4)}`, 'Ben Carter');
    await shot(page, { group, title: 'Booking, declined and not charged', route: '/booking/[id]' }, 'booking-declined');
  });

  test('5 approved expert', async ({ page }) => {
    begin(5);
    const group = '5. Approved expert';
    await enter(page, EXPERT);

    await open(page, '/studio', 'Dana Okafor');
    await shot(page, { group, title: 'Studio', route: '/studio', note: 'With one request waiting, a call today and some past earnings.' }, 'studio');

    await page.getByText('Decline', { exact: true }).first().click().catch(() => undefined);
    await shot(page, { group, title: 'Studio, declining a request', route: '/studio' }, 'studio-decline');

    await open(page, '/studio/availability', 'Weekly hours');
    await shot(page, { group, title: 'Availability', route: '/studio/availability' }, 'availability');

    await open(page, '/studio/session-settings', 'Payouts');
    await shot(page, { group, title: 'Session settings: price and payouts', route: '/studio/session-settings' }, 'session-settings');

    await open(page, '/studio/calendar');
    await shot(page, { group, title: 'Booking calendar', route: '/studio/calendar' }, 'calendar');

    await open(page, '/studio/earnings', 'Earnings');
    await shot(page, { group, title: 'Earnings', route: '/studio/earnings' }, 'earnings');

    await open(page, `/expert/${EXPERT_ME}`, 'Dana Okafor');
    await shot(page, { group, title: 'Your own profile, with edit links', route: '/expert/[id]' }, 'own-profile');

    for (const [section, name] of [
      ['identity', 'name, role and photo'],
      ['topics', 'topics'],
      ['help', 'how you can help'],
      ['background', 'background'],
    ] as const) {
      await open(page, `/expert-profile-edit?section=${section}`);
      await shot(page, { group, title: `Edit profile: ${name}`, route: `/expert-profile-edit?section=${section}` }, `edit-profile-${section}`);
    }

    await open(page, '/bookings', 'As expert');
    await page.getByText('As expert', { exact: true }).click().catch(() => undefined);
    await shot(page, { group, title: 'Bookings, as expert', route: '/bookings' }, 'bookings-expert');

    await open(page, `/booking/${B(6)}`, 'Jordan Lee');
    await shot(page, { group, title: 'A confirmed session, expert view', route: '/booking/[id]' }, 'booking-expert-view');

    await open(page, '/profile', 'Edit account');
    await shot(page, { group, title: 'You, as an approved expert', route: '/profile' }, 'you-expert');

    await open(page, '/', 'Talk to a human');
    await shot(page, { group, title: 'Home, as an approved expert', route: '/' }, 'home-expert');
  });

  test('6 website pages', async ({ page }) => {
    begin(6);
    const group = '6. Website (palamapp.com)';
    const docs = path.resolve(__dirname, '../../docs');
    const file = (name: string) => `file:///${path.join(docs, name).replace(/\\/g, '/')}`;
    for (const [name, title] of [
      ['index.html', 'Landing page'],
      ['privacy.html', 'Privacy policy'],
      ['terms.html', 'Terms of service'],
      ['delete-account.html', 'Delete your account (web page)'],
      ['404.html', 'Hand-off and not-found page'],
    ] as const) {
      await page.goto(file(name));
      await page.waitForTimeout(800);
      counter += 1;
      const out = `${String(counter).padStart(3, '0')}-web-${name.replace('.html', '')}.png`;
      await page.screenshot({ path: path.join(SHOTS, out), fullPage: true });
      entries.push({ file: out, group, title, route: name === 'index.html' ? 'palamapp.com' : `palamapp.com/${name.replace('.html', '')}` });
    }
  });
});
