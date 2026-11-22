// A new account's name starts as the first half of its email address
// ("jordan.lee88"), because that is all the app knows at sign-up. That is not
// something to show an expert on their calendar, so until the person has
// typed a real name the app asks for one.

/** True while the name is still the placeholder made from the email address. */
export const needsRealName = (
  displayName: string | null | undefined,
  email: string | null | undefined,
): boolean => {
  const name = (displayName ?? '').trim().toLowerCase();
  if (!name || name === 'you') return true;
  const local = (email ?? '').split('@')[0]?.trim().toLowerCase() ?? '';
  return Boolean(local) && name === local;
};

/** First and last name as one tidy string. */
export const fullName = (first: string, last: string): string =>
  `${first.trim()} ${last.trim()}`.replace(/\s+/g, ' ').trim();
