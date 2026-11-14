/** Every in-app URL, in one place. */
export const HOME_URL = '/';
export const LOGIN_URL = '/login';
export const SIGNUP_URL = '/signup';
export const FORGOT_PASSWORD_URL = '/forgot-password';
export const COLLECTIONS_URL = '/collections';
export const PEOPLE_URL = '/people';
export const SEARCH_URL = '/search';
export const SETTINGS_URL = '/settings';
export const TIMELINE_URL = '/timeline';
export const LABS_URL = '/labs';
export const VIBES_URL = '/vibes';
export const LANDING_URL = '/landing';
export const GITHUB_URL = 'https://github.com/dynamismlabs/lore';

export const collectionUrl = (id: string) => `/collections/${id}`;
export const memoryUrl = (id: string) => `/memories/${id}`;
export const personUrl = (id: string) => `/people/${id}`;
export const inviteUrl = (token: string) => `/invite/${token}`;

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: unknown, fallback = HOME_URL) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : fallback;
}
