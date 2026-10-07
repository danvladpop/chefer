import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';

// Secondary nav items of the More tab — the mobile counterpart of web's
// MobileNavDrawer (SECONDARY_NAV_ITEMS / GYM_SECONDARY_NAV_ITEMS in
// apps/web/src/features/nav/nav-items.ts). One list per mode; the screen
// itself is shared (more-screen.tsx).
export type MoreItem = {
  href: Href;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  testID: string;
};

// P2-2 / P2-8: Tracker moved into Today ("See full day"), Pantry into Shop
// ("In my kitchen"), History into My weeks. Their screens still open by route.
export const FOOD_MORE_ITEMS: readonly MoreItem[] = [
  { href: '/chat', label: 'AI Chef', icon: 'chatbubble-ellipses-outline', testID: 'more-ai chef' },
  { href: '/progress', label: 'Progress', icon: 'stats-chart-outline', testID: 'more-progress' },
  { href: '/my-weeks', label: 'My weeks', icon: 'repeat-outline', testID: 'more-my-weeks' },
  // UX-ACC-19: Household is a home, Following is people — two different icons.
  { href: '/household', label: 'Household', icon: 'home-outline', testID: 'more-household' },
  { href: '/profile', label: 'Profile', icon: 'person-outline', testID: 'more-profile' },
  // T-00.9: "Preferences" renamed to "Settings" and points to the new hub —
  // the individual preference cards are still reachable from there.
  { href: '/settings', label: 'Settings', icon: 'settings-outline', testID: 'more-settings' },
];

// FB7-01: Gym mode's More tab. Gym settings used to be reachable only from
// the header gear; Profile, Progress and Settings are account-level screens
// that web also reaches from its header menu.
export const GYM_MORE_ITEMS: readonly MoreItem[] = [
  {
    href: '/gym/settings',
    label: 'Gym settings',
    icon: 'options-outline',
    testID: 'more-gym-settings',
  },
  { href: '/profile', label: 'Profile', icon: 'person-outline', testID: 'more-profile' },
  { href: '/progress', label: 'Progress', icon: 'stats-chart-outline', testID: 'more-progress' },
  { href: '/settings', label: 'Settings', icon: 'settings-outline', testID: 'more-settings' },
];

// Following (docs/friends/ux-design.md §2.1): directly below Profile, only
// while `friends.availability` says yes — with it off, nothing renders and
// nothing but `availability` is queried. The pill is pending requests +
// unread Activity: the in-app notification badge (there is no push).
export const FOLLOWING_ITEM: MoreItem = {
  href: '/friends',
  label: FRIENDS_COPY.nav.label,
  icon: 'people-outline',
  testID: 'more-friends',
};

export function withFollowing(items: readonly MoreItem[], available: boolean): MoreItem[] {
  if (!available) return [...items];
  const at = items.findIndex((item) => item.testID === 'more-profile') + 1;
  return [...items.slice(0, at), FOLLOWING_ITEM, ...items.slice(at)];
}
