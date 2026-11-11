# Palam security audit — November 11, 2026

Scope: RLS policies (migrations 0001–0012), all eight Edge Functions, storage
buckets, secrets hygiene, client auth/session handling, and read-only
adversarial probes against the live REST API using only the public anon key.

**Bottom line:** nothing was exposed to *anonymous* callers — every live probe
came back empty or rejected (evidence below). The real gaps were what a
*signed-in* user could do with hand-crafted REST calls: approve their own
expert application, give themselves a verified badge and fake ratings, set
their own booking price, or forge payment state. All of those are closed by
migration `0014_security_hardening.sql` plus five updated Edge Functions in
this commit. **The fixes are not live until you deploy them — see
"Deploy the fixes (order matters)" below.**

---

## Findings

Severity reflects impact once real users and real money are on the platform.
"Fixed" means fixed in this commit (pending your deploy).

### High

| # | Finding | Status |
|---|---------|--------|
| H1 | **Expert self-approval and badge/rating tampering.** The RLS write policies on `expert_profiles` checked *who* writes (the row owner) but not *what* they write. A signed-in user crafting their own REST request could insert or update their row with `status='approved'` (skipping your review), `verified=true`, or any `rating_average`/`rating_count` — appearing on Discover instantly as a 5★ "verified" expert. | **Fixed** — 0014 guard trigger forces `status='pending'`, `verified=false`, zero ratings on client inserts and keeps the stored values on client updates. Only the dashboard/service role can change them. |
| H2 | **Client-controlled booking price.** `bookings.price_cents` was written by the client at insert and `create-checkout-session` charged whatever the row said — a crafted insert could book any expert for 1¢. | **Fixed** twice: 0014 forces the stored price to the expert's current rate at insert, and `create-checkout-session` now independently charges the rate it reads server-side, never the row value. |
| H3 | **Pending applications readable by any signed-in user.** `expert_profiles_select_all` let every authenticated user read every row, including `status='pending'` applications (headline, rate, LinkedIn URL, `how_i_can_help` — and, once 0011 is applied, `application_goal` and the resume storage path). | **Fixed** — 0014 replaces it with "approved rows, or your own row". Residual: see L4. |
| H4 | **Forged payment state.** `bookings_update_party` allowed either party to update *any* column: `payment_status` could be flipped to `captured` without paying, and the Stripe correlation ids (`stripe_checkout_session_id`, `stripe_payment_intent_id`) could be cleared or re-pointed, breaking webhook reconciliation and refunds. A crafted *insert* could likewise start life as "paid". | **Fixed** — 0014 guard trigger: payment/Stripe/Daily columns, price, parties, and times are server-owned; clients can only change `status` and `cancellation_reason` (plus future columns like the 0012 no-show fields). The five Edge Functions now perform their privileged writes with the service role. |

### Medium

| # | Finding | Status |
|---|---------|--------|
| M1 | **Attacker-chosen call URL.** `call_room_url` was client-writable, and the booking screen opens the stored URL directly when present — the other party's "Join call" could open any site the attacker chose. | **Fixed** — 0014 makes the column server-owned; only `create-daily-room` (service role) writes it, so the stored URL is always a Daily-minted room. |
| M2 | **Daily rooms are `privacy: 'public'`.** Anyone who obtains a room URL can join the call — the URL is only visible to the two parties in the DB, but it can leak (shared screenshots, browser history). | **Owner / post-launch** — move to `privacy:'private'` with per-participant meeting tokens minted in `create-daily-room`. Needs a small client change (always fetch via the function); fine to ship launch without, risky to leave forever. |
| M3 | **Conversation spoofing/re-pointing.** Any expert could open a conversation with *any* user as the "customer", and either party could UPDATE a conversation's `customer_id`/`expert_profile_id`, grafting a thread (and its messages) onto someone else. | **Fixed** — 0014: customers start their own conversations; an expert can only start one with a customer who has a booking with them; parties are immutable after creation. *(Applies once 0008 is on the live DB — see deploy notes.)* |
| M4 | **Ratings never actually updated (integrity).** `recompute_expert_rating` ran as the calling user, so RLS filtered its UPDATE to zero rows whenever a customer posted a review — `rating_average`/`rating_count` silently stayed stale. Trust-relevant on a marketplace. | **Fixed** — 0014 recreates it as `SECURITY DEFINER`. |
| M5 | **Live DB is missing applied migrations.** Probes show `conversations`/`messages` (0008) and the 0011 columns don't exist on the live project — messaging is broken live, and the app's expert queries will error once builds that expect 0011 ship. | **Owner** — apply 0008, 0011, 0012, 0013, then 0014, in that order (deploy notes below). |

### Low / accepted for launch

| # | Finding | Status |
|---|---------|--------|
| L1 | Either party can set a booking to `completed`, which unlocks the review form without the call necessarily happening. The review is still tied to a real, paid booking by the paying customer, so abuse is self-funded. | Accepted; revisit with a status-transition trigger if abused. |
| L2 | Refund policy was "either party, any time". A parallel work stream has since added a server-side 24-hour cancellation policy to `refund-booking` (expert refunds any time; customers only >24h before start). | Addressed in-flight; verify it deploys with the rest. |
| L3 | Every signed-in user can read every `profiles` row (display name, avatar, bio). Display names default to the part of the email before the `@`, so a throwaway account can harvest those prefixes. | Accepted for a marketplace at this scale; encourage users to set display names. `stripe_customer_id` on profiles is unused and now server-owned (0014); consider dropping the column. |
| L4 | On **approved** experts' rows, `linkedin_url`, `how_i_can_help` (and post-0011 `application_goal`, `resume_url` path) remain readable to signed-in users who ask for those columns — RLS is row-level, not column-level. The resume *file* stays protected (private bucket, owner-only read). | Accepted; post-launch, move vetting-only fields to a separate `expert_applications` table with owner-only policies. |
| L5 | `notify-application`/`lifecycle-emails` compare the webhook secret with `!=` (not constant-time), and the secret is embedded in trigger definitions visible to anyone with SQL-editor access. | Accepted at this scale. |
| L6 | No server-side rate limiting on booking creation or messaging — a signed-in user can spam an expert with `requested` bookings. | Accepted for launch; Supabase auth rate limits (checklist) cover sign-up abuse, and booking requires a real account. |
| L7 | Web builds keep the Supabase session in `localStorage` (XSS-reachable); native uses SecureStore. PKCE flow is on, OTP sign-in is the 6-digit email code. A malicious app squatting the `palam://` scheme can't complete the magic-link exchange (PKCE verifier stays in the legit app) and the OTP path doesn't use deep links at all. | Accepted — standard for Expo web. Keep the web app free of third-party scripts. |

### Verified good (no action)

- **stripe-webhook** verifies the `Stripe-Signature` header with
  `constructEventAsync` against `STRIPE_WEBHOOK_SECRET` before touching the DB;
  unsigned/garbage posts get 400. Uses the service role only after verification.
- **Every other Edge Function** authenticates: user-JWT functions
  (`create-checkout-session`, `refund-booking`, `create-daily-room`,
  `create-connect-account`, `sync-connect-status`, `delete-account`) resolve the
  caller via `auth.getUser()` and check booking/row ownership; webhook functions
  (`notify-application`, `lifecycle-emails`) require `x-webhook-secret`.
  `refund-booking` and `create-daily-room` both reject non-parties (403).
- **Storage**: `resumes` bucket is private with owner-only read/write by folder;
  `avatars`/`cover-images` are public-read by design with owner-only writes to
  their own folder. MIME and size limits set on all three.
- **Secrets hygiene**: `.env` is gitignored and untracked; `eas.json` and
  `.env.example` contain only publishable values (`sb_publishable_…`,
  `pk_test_…`). No `sk_`, `whsec_`, service-role, Resend, or Daily keys
  anywhere in the tree. (Reminder: the repo is public — keep it that way.)
  Note: `eas.json`'s **production** profile still uses the **test** Stripe
  publishable key; swap to the live key at launch.
- **Anonymous probes** (public anon key, no user): `profiles`,
  `expert_profiles`, `bookings`, `reviews`, `credentials`,
  `availability_windows`, `availability_dates` all returned `200 []`;
  an anonymous INSERT on `profiles` was rejected with an RLS violation (401);
  an anonymous UPDATE probe matched zero rows; the `resumes` bucket serves
  nothing via the public endpoint and lists empty; auth settings show email
  sign-in only, anonymous sign-ins disabled, no OAuth providers enabled.

---

## Deploy the fixes (ORDER MATTERS)

1. **Redeploy the five updated Edge Functions** (Supabase → Edge Functions →
   open each → paste the file from this commit → Deploy; keep **Verify JWT
   OFF** as before):
   `create-checkout-session`, `refund-booking`, `create-daily-room`,
   `create-connect-account`, `sync-connect-status`.
   No new secrets needed — `SUPABASE_SERVICE_ROLE_KEY` is auto-injected.
2. **Apply pending migrations in the SQL editor, in order:**
   `0008` (messaging — currently missing live), `0011`, `0012` (no-show
   reports), `0013` (lifecycle emails, with its webhook secret filled in),
   then **`0014_security_hardening.sql`**.
3. If you ran 0014 before 0008 for any reason, just run 0014 again after —
   it's safe to re-run and will pick up the messaging hardening.

Why this order: the new functions write payment/Stripe columns with the
service role. If 0014's guards go live while the *old* functions are still
deployed, those writes get silently dropped and payments stop reconciling.

---

## Owner checklist — Supabase dashboard (can't be set from code)

| Setting | Where | What to do |
|---|---|---|
| Custom SMTP for auth emails | Authentication → Emails → SMTP Settings | **Launch blocker.** Built-in email is limited to ~2 emails/hour — OTP sign-in dies at the first handful of users. Point it at Resend (you already have an account) or similar. |
| OTP expiry & length | Authentication → Sign In / Providers → Email | Set OTP expiry to 600–900 s (default is 1 h, longer than needed) and keep the 8-digit codes you already configured. |
| Auth rate limits | Authentication → Rate Limits | Review limits for "email sent", "OTP verifications", and "token refresh" once custom SMTP is on — these are your main brute-force/abuse defense. |
| Attack protection / CAPTCHA | Authentication → Attack Protection | Optional. Note: enabling CAPTCHA **breaks sign-in until the app sends captcha tokens** — don't flip it on without a coordinated app change. Rate limits above are the no-code protection. |
| Redirect URLs | Authentication → URL Configuration | Allowlist should contain only: your web origin(s), `palam://auth-callback`, and (dev only) `exp+my-app://auth-callback` / localhost. Remove anything else. |
| Backups | Database → Backups | Confirm daily backups exist on your plan; on Pro consider PITR before launch. You're handling paid bookings — know your restore story. |
| Security Advisor | Advisors → Security Advisor | Run it after applying 0014; it flags anything the audit and you missed (it will still note "function search_path" style lints — the new guard functions are fine). |
| Stripe keys at launch | Stripe dashboard + Edge Function secrets + `eas.json` | Move `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` secrets and the app's publishable key from `sk_test`/`pk_test` to live keys together, and re-point the webhook endpoint to live mode. |
| Legacy API keys | Settings → API | You're on the new `sb_publishable_` key — good. Confirm the legacy JWT-based anon/service keys are disabled if the dashboard offers it. |

---

## Do we need 2FA?

**For launch: no.** Sign-in is already a possession factor (a 6-digit code to
the user's email inbox, no passwords to phish or stuff). The realistic
account-takeover path is a compromised email account, and the people who'd be
hurt most are experts with payouts — but payout *destinations* live inside
Stripe Express, which has its own authentication, so a hijacked Palam account
can't silently re-route money.

**Post-launch: add optional TOTP MFA for experts.** Supabase's MFA API
(`supabase.auth.mfa.enroll/challenge/verify`) supports TOTP authenticator apps
on every plan at no extra cost. Sensible shape:

- Offer "Add an authenticator app" in Studio settings, experts first
  (they handle money; customers can have it later).
- At sign-in, if the account has a factor enrolled, show the 6-digit
  authenticator challenge after the email OTP step
  (`getAuthenticatorAssuranceLevel()` → challenge when `nextLevel='aal2'`).
- Estimated effort: 1–2 days (enroll screen with QR code, challenge screen,
  auth-store wiring, a "lost my device" support path — recovery is the part
  that deserves the most thought).

Phone/SMS MFA is a paid add-on and adds SIM-swap risk — skip it.

---

## What changed in this commit

- `supabase/migrations/0014_security_hardening.sql` — all RLS/trigger fixes
  (H1–H4, M1, M3, M4). Guards are keyed on the API roles, so the dashboard,
  SQL editor, and service role are unaffected.
- `supabase/functions/create-checkout-session/index.ts` — charges the expert's
  current rate read server-side; writes price/session-id/fee via service role.
- `supabase/functions/refund-booking/index.ts` — writes `payment_status` via
  service role (on top of the in-flight 24-hour policy change).
- `supabase/functions/create-daily-room/index.ts` — writes room fields via
  service role.
- `supabase/functions/create-connect-account/index.ts` /
  `sync-connect-status/index.ts` — write Stripe Connect state via service role.

No app-code (client) changes were needed; the guards were designed so every
existing client write keeps working unchanged.
