import { FRIENDS_COPY } from '@chefer/types';

// Header titles of the Following routes (UX §2.2). Every one comes from
// FRIENDS_COPY except `Blocked people`, which the copy deck only has with a
// count (`settings.blocked(n)` → "Blocked people (2)", the Settings row).
// TODO(F2.0 → copy owner): add `blocked.title: 'Blocked people'` to
// FRIENDS_COPY and use it here; the literal below is the UX §2.2 string.
export const FRIENDS_SCREEN_TITLES = {
  home: FRIENDS_COPY.home.title,
  requests: FRIENDS_COPY.requests.title,
  activity: FRIENDS_COPY.activity.title,
  settings: FRIENDS_COPY.settings.title,
  blocked: 'Blocked people',
  suggestions: FRIENDS_COPY.home.suggested,
} as const;
