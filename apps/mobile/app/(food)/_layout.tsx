import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { colors, countPillText } from '@chefer/ui-mobile';
import { usePendingOnboarding } from '../../src/features/auth/pending-onboarding';
import { useFriendsMe } from '../../src/features/friends/api/use-friends-me';
import { landingSurfaceSync, useSyncLandingCache } from '../../src/features/navigation/use-landing';
import { getToken } from '../../src/lib/auth-store';
import { TAB_BAR_SCREEN_OPTIONS } from '../../src/lib/tab-bar-options';

// Food mode tab bar. Mirrors PRIMARY_NAV_ITEMS + "More" from
// apps/web/src/features/nav/nav-items.ts: Today · Plan · Shop · Cookbook ·
// More (P2-2 / P2-8 — Today merges Home and the Tracker; Shop holds the
// pantry; Cookbook is the old Recipes tab plus Discover). (Renamed from
// `(tabs)` for the Food / Gym mode switch — gym_plan.md §5.1; URLs are
// unchanged.)

/**
 * ONE-SHOT per sign-in (per launch), not per mount: switching to Gym replaces
 * this group in the root Stack (it unmounts), so a per-mount check re-ran on
 * every switch back to Food and, for a TRAIN-only account, redirected
 * straight to /today again — Food was unreachable (owner dogfood 2026-09-30,
 * iPhone). Keyed by the token so a fresh sign-in still gets its landing.
 */
let landingCheckedForToken: string | null = null;

export default function FoodTabsLayout() {
  // "/" is home; where home opens is `landingSurfaceSync()` (UX-04 §1,
  // T-04.3) — the persisted mode (today's behaviour, gym_plan.md D3) plus,
  // for an account that's never explicitly switched, a jobs-based default
  // (TRAIN-only lands on Gym once it's set up). A landing never re-applies
  // once the app is open (caught by e2e/gym-mode.flow.yaml, 2026-09-25),
  // and never writes the persisted mode.
  const pathname = usePathname();
  useSyncLandingCache();
  // Following (ux-design.md §2.1): the More tab carries the in-app
  // notification badge (pending requests + unread Activity, capped `9+`,
  // hidden at 0). This always-mounted layout is what keeps the 60 s
  // foreground poll running; with `friends.availability` off it only ever
  // asks `availability` and the count stays 0.
  const { badgeCount } = useFriendsMe();
  // R-18b: a just-registered account goes through onboarding first — decided
  // here, as state, because this is the first protected screen the sign-in
  // guard flip mounts (see pending-onboarding.ts). Wins over the landing
  // surface below so a leftover Gym mode can't swallow it.
  const onboardingPending = usePendingOnboarding();
  const token = getToken();
  if (onboardingPending) {
    return <Redirect href="/onboarding" />;
  }
  if (landingCheckedForToken !== token) {
    landingCheckedForToken = token;
    if (pathname === '/' && landingSurfaceSync() === 'gym') {
      return <Redirect href="/today" />;
    }
  }

  return (
    <Tabs screenOptions={TAB_BAR_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping-list"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Cookbook',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarBadge: badgeCount > 0 ? countPillText(badgeCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            fontSize: 12,
          },
          tabBarAccessibilityLabel: badgeCount > 0 ? `More, ${badgeCount} new` : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size + 2} />
          ),
        }}
      />
    </Tabs>
  );
}
