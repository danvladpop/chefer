import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { countPillText, haptics, useReducedMotion, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../src/components/icon';
import { SnackbarAwareTabBar } from '../../src/components/snackbar-tab-bar';
import { usePendingOnboarding } from '../../src/features/auth/pending-onboarding';
import { useFriendsMe } from '../../src/features/friends/api/use-friends-me';
import { useOnboardingGate } from '../../src/features/onboarding/use-onboarding-gate';
import { TabIcon } from '../../src/features/shell/tab-icon';
import { WorkoutMiniBar } from '../../src/features/shell/workout-mini-bar';
import { ShellCrossfade } from '../../src/features/trainer-mode/shell-crossfade';
import { personalHomeHref } from '../../src/features/trainer-mode/switch-mode';
import { TRAINER_TABS } from '../../src/features/trainer-mode/trainer-tabs';
import { useMarkShellMode } from '../../src/features/trainer-mode/use-mark-shell-mode';
import {
  useTrainerBadges,
  useTrainerModeAvailability,
} from '../../src/features/trainer-mode/use-trainer-mode';
import { tabAccessibilityLabel } from '../../src/lib/tab-bar-options';

// ─── Trainer mode: the second app shell (docs/prd-2026-10/trainer-mode.md §5.2) ───
// Schedule · Clients · Today · Workouts · You, for an active trainer with the
// `trainerMode` flag. Mirrors (main)/_layout.tsx: the same tab bar (workout
// mini bar, snackbar-aware), selection haptic and crossfade, and Today in the
// middle as the initial route that Android Back returns to. Pushed pages
// (a client, their routine, the invite) stay root-level `trainer/*` routes
// that work from either mode. Badges: Clients counts pending requests; You
// counts what waits in personal mode (Following, §7.1).
// The tab URLs share names with other groups (`/today`, `/you`): navigate
// here with the explicit group, `/(trainer)/today`.

export default function TrainerTabsLayout() {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const available = useTrainerModeAvailability();
  const { requests } = useTrainerBadges();
  const { badgeCount: personalWaiting } = useFriendsMe();
  const onboardingPending = usePendingOnboarding();
  const onboardingUnfinished = useOnboardingGate();
  const gated = onboardingPending || onboardingUnfinished;
  // Being here is being in trainer mode (a deep link included).
  useMarkShellMode('trainer', available && !gated);

  if (gated) return <Redirect href="/onboarding" />;
  // §5.1 "Losing trainer status": tools off, allowlist or flag gone — personal mode.
  if (!available) return <Redirect href={personalHomeHref()} />;

  const badgeFor = (name: string) =>
    name === 'clients' ? requests : name === 'you' ? personalWaiting : 0;

  return (
    <ShellCrossfade>
      <Tabs
        initialRouteName="today"
        backBehavior="initialRoute"
        // Premium motion #9: a selection haptic on every tab press and a short
        // crossfade between tabs (none under reduced motion).
        screenListeners={{ tabPress: () => haptics.selection() }}
        screenOptions={{
          headerShown: false,
          animation: reducedMotion ? 'none' : 'fade',
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
        {TRAINER_TABS.map((tab, index) => {
          const badge = badgeFor(tab.name);
          return (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: tab.title,
                tabBarButtonTestID: `trainer-tab-${tab.name}`,
                tabBarAccessibilityLabel: tabAccessibilityLabel(
                  tab.title,
                  index,
                  TRAINER_TABS.length,
                  badge,
                ),
                tabBarIcon: ({ color, focused }) => (
                  <TabIcon focused={focused}>
                    <Icon name={focused ? tab.activeIcon : tab.icon} color={color} size={24} />
                  </TabIcon>
                ),
                tabBarBadge: badge > 0 ? countPillText(badge) : undefined,
                tabBarBadgeStyle: {
                  backgroundColor: colors.brand,
                  color: colors.onBrand,
                  fontSize: 12,
                },
              }}
            />
          );
        })}
      </Tabs>
    </ShellCrossfade>
  );
}
