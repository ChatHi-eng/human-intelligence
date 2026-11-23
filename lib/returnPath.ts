// Where someone was trying to go when they were asked to sign in.
//
// A link in an email or notification (a booking, a review) can be opened by
// someone who is signed out. Without this they would sign in and land on the
// home screen, with the thing they tapped nowhere in sight. The path is kept
// for half an hour, on the web in localStorage (signing in by emailed link
// opens a fresh page) and on a phone in memory.

const KEY = 'palam.returnPath';
const MAX_AGE_MS = 30 * 60_000;

// Only screens it makes sense to come back to. Never an outside address.
const ALLOWED = [/^\/booking\/[0-9a-f-]{36}(\?review=1)?$/i, /^\/book\/[0-9a-f-]{36}$/i, /^\/studio(\/[a-z-]+)?$/, /^\/bookings$/, /^\/profile-edit$/];

export const isReturnable = (path: string) => ALLOWED.some((pattern) => pattern.test(path));

let memory: { path: string; at: number } | null = null;

export const rememberReturnPath = (path: string) => {
  if (!isReturnable(path)) return;
  const value = { path, at: Date.now() };
  memory = value;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  } catch {
    /* private mode: memory only */
  }
};

// Returns the remembered path once, then forgets it.
export const takeReturnPath = (): string | null => {
  let value = memory;
  memory = null;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      globalThis.localStorage?.removeItem(KEY);
      value ??= JSON.parse(raw) as { path: string; at: number };
    }
  } catch {
    /* nothing stored */
  }
  if (!value || typeof value.path !== 'string' || typeof value.at !== 'number') return null;
  if (Date.now() - value.at > MAX_AGE_MS || !isReturnable(value.path)) return null;
  return value.path;
};
