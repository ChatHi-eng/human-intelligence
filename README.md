# Human Intelligence

A marketplace for paid, real-human expert advice — by video or phone. Think TaskRabbit meets AirBnB Experiences, but for expertise (lawyers, therapists, coders, designers, tradesmen, etc.).

**Product thesis.** As AI floods the internet with synthetic content and displaces experienced workers, there's a growing market for paid, real-human guidance.

This repo currently contains the **scaffolded UI shell** for the mobile app. Every screen is reachable, every list renders mock data through TanStack Query, and every third-party integration is behind a `services/*` stub so the real keys can drop in later without touching screens.

## Stack

- **Expo SDK 56** + **expo-router v5** (file-based routing, TypeScript strict mode)
- **Zustand** for global state (auth, booking draft)
- **TanStack Query v5** for server cache (mock query fns for now)
- **Supabase** (`@supabase/supabase-js`) — stubbed; wired via `services/supabase.ts`
- **Stripe** (`@stripe/stripe-react-native`) — stubbed; **not yet installed** (needs a dev build)
- **Daily.co** for video — stubbed; **not yet installed** (needs a dev build). Chosen over Twilio because Twilio Programmable Video was sunset for new customers in Dec 2024.
- **react-native-calendars** for the scheduling UI
- **react-native-gifted-charts** for the earnings chart (chosen over `victory-native` which now requires Skia)
- **expo-calendar** + **expo-notifications** for device calendar events and reminders
- ESLint (`expo lint`) + Prettier

## Folder structure

```
my-app/
├── app/                          # expo-router screens — each file = one route
│   ├── (auth)/                   # login / signup / onboarding
│   ├── (tabs)/                   # main customer tabs
│   │   ├── index.tsx             # Discover (search)
│   │   ├── bookings.tsx          # My bookings
│   │   ├── messages.tsx          # Threads with experts
│   │   └── profile.tsx           # Account
│   ├── (expert)/                 # expert-only tabs
│   │   ├── dashboard.tsx         # Earnings + today's schedule
│   │   ├── calendar.tsx          # Availability + bookings
│   │   └── earnings.tsx          # Daily / weekly / monthly + chart
│   ├── expert/[id].tsx           # Public expert profile + booking flow
│   ├── booking/[id].tsx          # Booking detail + (stubbed) call screen
│   └── _layout.tsx               # Root layout + providers
├── components/                   # Reusable UI
│   ├── ui/                       # Primitives (Button, Card, Avatar, RatingStars, Screen, …)
│   ├── expert/                   # ExpertCard, ExpertList, CredentialBadge
│   ├── booking/                  # BookingCard, TimeSlotPicker, PaymentSheet
│   └── call/                     # CallControls, VideoTile, CallTimer
├── hooks/                        # useAuth, useExperts, useBookings, useEarnings
├── services/                     # API/3rd-party wrappers (UI never imports SDKs directly)
│   ├── supabase.ts
│   ├── stripe.ts
│   ├── video.ts                  # Daily.co
│   ├── calendar.ts               # expo-calendar + Google Calendar sync stub
│   └── notifications.ts          # local notifications + email service stub
├── store/                        # Zustand stores (authStore, bookingStore)
├── types/                        # Shared TypeScript types
├── constants/                    # theme.ts (colors/spacing/radius/typography), industries.ts
├── lib/                          # Pure helpers (date, format, mockData)
└── assets/                       # Images, icons, fonts
```

## Running

You'll need Node 20+. If `node` isn't on PATH (Windows), add `C:\Program Files\nodejs`.

```bash
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app on your phone, or press `i` / `a` to open the iOS / Android simulator.

### Expo Go vs dev build

The session-one scaffold deliberately runs in **Expo Go** with these features stubbed (because their SDKs require a development build):

- `@stripe/stripe-react-native` — payment UI is stubbed in `services/stripe.ts`
- `@daily-co/react-native-daily-js` — video call screen is stubbed in `services/video.ts` + `components/call/*`
- `expo-calendar` and remote push via `expo-notifications` — fall back to no-ops in Expo Go

When we wire up real keys, the plan is to switch to an EAS development build (`eas build --profile development`) so the native modules can load. Until then, all four stubs preserve the API surface so swapping them out is a one-file change per service.

## Environment

Copy `.env.example` to `.env` and fill in. The app reads `EXPO_PUBLIC_*` vars via `process.env`.

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=
EXPO_PUBLIC_DAILY_DOMAIN=
```

`.env` is gitignored. Never put secret (server-side) Stripe or Supabase keys in the app.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` / `npm run web` | Open in the relevant target |
| `npm run lint` | ESLint via `expo lint` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI) |
| `npm run typecheck` | `tsc --noEmit` |

## Engineering standards

- TypeScript strict + `noUncheckedIndexedAccess`. No `any` without a justification comment.
- Every screen and reusable component has a typed props interface.
- UI never imports `@supabase/supabase-js`, `@stripe/stripe-react-native`, `@daily-co/react-native-daily-js`, `expo-calendar`, or `expo-notifications` directly — always go through `services/*`.
- Errors surface via the shared `ErrorBoundary` + `react-native-toast-message`.
- Loading + empty states everywhere — no blank screens during fetch.
- No magic numbers in component files — shared values live in `constants/theme.ts`.

## Roadmap (post-scaffold)

- `feat/auth-supabase` — wire real Supabase auth, replace the mock `authStore`
- `feat/booking-flow` — real Stripe PaymentSheet (requires dev build)
- `feat/video-daily` — real Daily.co call screen (requires dev build)
- `feat/expert-profile` — credential uploads, verification flow
- `feat/notifications` — Expo push + Supabase Edge Function for booking confirmation emails
