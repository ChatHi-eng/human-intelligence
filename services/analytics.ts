// PostHog analytics — thin wrapper. UI and hooks call capture()/identify()/
// reset() from this module only and never import posthog-react-native directly.
//
// When EXPO_PUBLIC_POSTHOG_API_KEY is missing (local dev, CI) no client is
// created and every function is a silent no-op — the app must work keyless.
//
// Privacy rule: never pass emails or free-text content (headlines, pitches,
// messages, review comments) as event properties. IDs, booleans, counts and
// enum-ish strings only.
import PostHog from 'posthog-react-native';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const client: PostHog | null = apiKey ? new PostHog(apiKey, { host }) : null;

type Properties = Record<string, string | number | boolean | null>;

export const capture = (event: string, properties?: Properties): void => {
  client?.capture(event, properties);
};

export const identify = (userId: string): void => {
  client?.identify(userId);
};

export const reset = (): void => {
  client?.reset();
};
