import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { landingSurfaceSync, useSyncLandingCache } from '../../src/features/navigation/use-landing';
import { TAB_BAR_SCREEN_OPTIONS } from '../../src/lib/tab-bar-options';

// Food mode tab bar. Mirrors PRIMARY_NAV_ITEMS + "More" from
// apps/web/src/features/nav/nav-items.ts: Today · Plan · Shop · Cookbook ·
// More (P2-2 / P2-8 — Today merges Home and the Tracker; Shop holds the
// pantry; Cookbook is the old Recipes tab plus Discover). (Renamed from
// `(tabs)` for the Food / Gym mode switch — gym_plan.md §5.1; URLs are
// unchanged.)
export default function FoodTabsLayout() {
  // "/" is home; where home opens is `landingSurfaceSync()` (UX-04 §1,
  // T-04.3) — the persisted mode (today's behaviour, gym_plan.md D3) plus,
  // for an account that's never explicitly switched, a jobs-based default
  // (TRAIN-only lands on Gym once it's set up). ONE-SHOT per mount: this
  // layout stays mounted behind the gym tabs, so a sticky decision would
  // bounce every later switch back to Food onto /today (caught by
  // e2e/gym-mode.flow.yaml, 2026-09-25) — a landing never re-applies once
  // the app is open, and never writes the persisted mode.
  const pathname = usePathname();
  const launchChecked = useRef(false);
  useSyncLandingCache();
  if (!launchChecked.current) {
    launchChecked.current = true;
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size + 2} />
          ),
        }}
      />
    </Tabs>
  );
}
