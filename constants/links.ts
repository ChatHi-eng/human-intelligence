// Public Palam links and contact points used across the app.
export const MARKETING_URL = 'https://palamapp.com';
export const TERMS_URL = 'https://palamapp.com/terms.html';
export const PRIVACY_URL = 'https://palamapp.com/privacy.html';
export const SUPPORT_EMAIL = 'info@palamapp.com';

// The deployed web app (repo ChatHi-eng/palam-web, GitHub Pages). Expert
// share links point here so they open in a browser with no app installed.
export const WEB_APP_URL = 'https://app.palamapp.com';
export const expertShareUrl = (expertId: string): string => `${WEB_APP_URL}/expert/${expertId}`;
