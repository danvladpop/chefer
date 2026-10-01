import { FRIENDS_COPY } from '@chefer/types';

// Header titles of the Following routes (UX §2.2), all from FRIENDS_COPY.
export const FRIENDS_SCREEN_TITLES = {
  home: FRIENDS_COPY.home.title,
  requests: FRIENDS_COPY.requests.title,
  activity: FRIENDS_COPY.activity.title,
  settings: FRIENDS_COPY.settings.title,
  blocked: FRIENDS_COPY.blocked.title,
  suggestions: FRIENDS_COPY.home.suggested,
} as const;
