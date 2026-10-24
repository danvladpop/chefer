import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { countPillText, useThemeColors } from '@chefer/ui-mobile';
import { SnackbarAwareTabBar } from '../../src/components/snackbar-tab-bar';
import { usePendingOnboarding } from '../../src/features/auth/pending-onboarding';
import { useFriendsMe } from '../../src/features/friends/api/use-friends-me';
import { claimLanding } from '../../src/features/navigation/landing-gate';
import { landingSurfaceSync, useSyncLandingCache } from '../../src/features/navigation/use-landing';
import { useOnboardingGate } from '../../src/features/onboarding/use-onboarding-gate';
import { ShellV2Forward } from '../../src/features/shell/shell-forward';
import { useShellV2 } from '../../src/features/shell/shell-store';
import { landingShellModeSync } from '../../src/features/trainer-mode/mode-store';
import { TRAINER_TODAY_HREF } from '../../src/features/trainer-mode/switch-mode';
import { getToken } from '../../src/lib/auth-store';
import { TAB_BAR_SCREEN_OPTIONS, tabAccessibilityLabel } from '../../src/lib/tab-bar-options';

// Food mode tab bar. Mirrors PRIMARY_NAV_ITEMS + "More" from
// apps/web/src/features/nav/nav-items.ts: Today · Plan · Shop · Cookbook ·
// More (P2-2 / P2-8 — Today merges Home and the Tracker; Shop holds the
// pantry; Cookbook is the old Recipes tab plus Discover). (Renamed from
// `(tabs)` for the Food / Gym mode switch — gym_plan.md §5.1; URLs are
// unchanged.)

// The one-shot landing check lives in features/navigation/landing-gate.ts.

/** Tabs below, for each tab's spoken "N of 5" (iOS). */
const TAB_COUNT = 5;

export default function FoodTabsLayout() {
  const colors = useThemeColors();
  // "/" is home; where home opens is `landingSurfaceSync()` (UX-04 §1,
  // T-04.3) — the persisted mode (today's behaviour, gym_plan.md D3) plus,
  // for an account that's never explicitly switched, a jobs-based default
  // (TRAIN-only lands on Gym once it's set up). A landing never re-applies
  // once the app is open (caught by e2e/gym-mode.flow.yaml, 2026-09-25),
  // and never writes the persisted mode.
  const pathname = usePathname();
  // Mobile UX revamp: with the new shell on, this group only forwards.
  const shellV2 = useShellV2();
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
  // UX-ONB-01: and an interrupted setup (killed app, Android BACK, a lost
  // local flag) is resumed here too, from the saved draft or the server's
  // "never answered the jobs question" — see use-onboarding-gate.ts.
  const onboardingUnfinished = useOnboardingGate();
  const token = getToken();
  if (onboardingPending || onboardingUnfinished) {
    return <Redirect href="/onboarding" />;
  }
  // Trainer mode §5.1: a device last left in trainer mode (and, as far as the
  // last answer knows, still allowed it) opens straight into trainer Today —
  // decided from the KV cache, so personal Today never flashes first.
  if (shellV2) {
    let landing: '/train' | typeof TRAINER_TODAY_HREF | undefined;
    if (claimLanding(token) && pathname === '/') {
      if (landingShellModeSync() === 'trainer') landing = TRAINER_TODAY_HREF;
      else if (landingSurfaceSync() === 'gym') landing = '/train';
    }
    return <ShellV2Forward landing={landing} />;
  }
  if (claimLanding(token) && pathname === '/') {
    if (landingShellModeSync() === 'trainer') return <Redirect href={TRAINER_TODAY_HREF} />;
    if (landingSurfaceSync() === 'gym') return <Redirect href="/today" />;
  }

  return (
    <Tabs
      screenOptions={TAB_BAR_SCREEN_OPTIONS}
      // R-11: lets the global snackbar sit above the tab bar.
      tabBar={(props) => <SnackbarAwareTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: tabAccessibilityLabel('Today', 0, TAB_COUNT),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{
          title: 'Plan',
          tabBarAccessibilityLabel: tabAccessibilityLabel('Plan', 1, TAB_COUNT),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping-list"
        options={{
          title: 'Shop',
          tabBarAccessibilityLabel: tabAccessibilityLabel('Shop', 2, TAB_COUNT),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Cookbook',
          tabBarAccessibilityLabel: tabAccessibilityLabel('Cookbook', 3, TAB_COUNT),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size + 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarAccessibilityLabel: tabAccessibilityLabel('More', 4, TAB_COUNT, badgeCount),
          tabBarBadge: badgeCount > 0 ? countPillText(badgeCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.brand,
            color: colors.onBrand,
            fontSize: 12,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size + 2} />
          ),
        }}
      />
    </Tabs>
  );
}
