import { View } from 'react-native';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { countPillText, useThemeColors } from '@chefer/ui-mobile';
import { Icon, type IconName } from '../../src/components/icon';
import { SnackbarAwareTabBar } from '../../src/components/snackbar-tab-bar';
import { usePendingOnboarding } from '../../src/features/auth/pending-onboarding';
import { useFriendsMe } from '../../src/features/friends/api/use-friends-me';
import { useSyncLandingCache } from '../../src/features/navigation/use-landing';
import { useOnboardingGate } from '../../src/features/onboarding/use-onboarding-gate';
import { isShellV2TabPath, type ShellTab } from '../../src/features/shell/shell-routes';
import { useShellV2 } from '../../src/features/shell/shell-store';
import { WorkoutMiniBar } from '../../src/features/shell/workout-mini-bar';

// ─── The new shell (mobile UX revamp, phase 1; plan: "Target navigation") ───
// One tab bar instead of two Food|Gym modes: Today · Meals · Shop · Train ·
// You (Plan was renamed Meals on 10 Oct so it reads as food, not training;
// the route stays /plan). Every account sees all five: the old app let anyone reach Food and
// Gym through the mode switch, so hiding tabs by onboarding jobs (first cut)
// stranded a "training only" account without Plan or Shop.
// Recipes live inside Plan, the old More inside You, Add and Ask Chef are
// header buttons. Only reachable while `mobileShellV2` (or the device
// preview) is on; the old (food)/(gym) groups redirect here then.

const TABS: { name: ShellTab; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'home', title: 'Today', icon: 'today', activeIcon: 'todayActive' },
  { name: 'plan', title: 'Meals', icon: 'plan', activeIcon: 'planActive' },
  { name: 'shop', title: 'Shop', icon: 'shop', activeIcon: 'shopActive' },
  { name: 'train', title: 'Train', icon: 'train', activeIcon: 'trainActive' },
  { name: 'you', title: 'You', icon: 'you', activeIcon: 'youActive' },
];

export default function MainTabsLayout() {
  const shellV2 = useShellV2();
  const pathname = usePathname();
  const colors = useThemeColors();
  useSyncLandingCache();
  // Same in-app Following badge the old More tabs carried, now on You.
  const { badgeCount } = useFriendsMe();
  const onboardingPending = usePendingOnboarding();
  const onboardingUnfinished = useOnboardingGate();

  if (onboardingPending || onboardingUnfinished) return <Redirect href="/onboarding" />;
  // The preview was switched off (or the flag flipped back): old shell —
  // once a new tab has focus, not from under a pushed Settings screen.
  if (!shellV2) return isShellV2TabPath(pathname) ? <Redirect href="/(food)" /> : null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.labelSecondary,
        tabBarStyle: { backgroundColor: colors.surfaceRaised, borderTopColor: colors.separator },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
      tabBar={(props) => (
        <View>
          <WorkoutMiniBar />
          <SnackbarAwareTabBar {...props} />
        </View>
      )}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarButtonTestID: `tab-${tab.name}`,
            tabBarIcon: ({ color, focused }) => (
              <Icon name={focused ? tab.activeIcon : tab.icon} color={color} size={24} />
            ),
            ...(tab.name === 'you' && {
              tabBarBadge: badgeCount > 0 ? countPillText(badgeCount) : undefined,
              tabBarBadgeStyle: {
                backgroundColor: colors.brand,
                color: colors.onBrand,
                fontSize: 12,
              },
              tabBarAccessibilityLabel: badgeCount > 0 ? `You, ${badgeCount} new` : undefined,
            }),
          }}
        />
      ))}
    </Tabs>
  );
}
