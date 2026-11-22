// Mobile numbers are stored and sent in the international form: a plus sign,
// the country code, then the number, digits only ("+14155550123").

/**
 * Turns what someone typed into that form, or null if it cannot be a phone
 * number. A ten-digit number with no country code is taken as US or Canada,
 * since that is where Palam starts; anyone else types their country code.
 */
export const normalizePhone = (typed: string): string | null => {
  const trimmed = typed.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  let candidate: string;
  if (trimmed.startsWith('+')) candidate = `+${digits}`;
  else if (digits.length === 10) candidate = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1')) candidate = `+${digits}`;
  else return null;
  return /^\+[1-9][0-9]{7,14}$/.test(candidate) ? candidate : null;
};

/** For showing a saved number back: all but the last four digits hidden. */
export const maskPhone = (phone: string): string =>
  phone.length <= 4 ? phone : `${'•'.repeat(Math.max(phone.length - 5, 3))} ${phone.slice(-4)}`;
