import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { router, useSegments } from 'expo-router';
import type { GymBootstrap } from '@chefer/types';
import { SegmentedControl } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { HeaderAvatar } from '../../../components/header-avatar';
import { trpc } from '../../../lib/trpc';
import { ShellTopBar } from '../../shell/shell-chrome';
import { useShellV2 } from '../../shell/shell-store';
import {
  commitPendingGymMode,
  deferGymMode,
  getMode,
  hasChosenMode,
  restoreMode,
  setMode,
  type AppMode,
} from '../mode-store';
import { gymBootstrapQueryKey, gymBootstrapQueryOptions } from '../use-gym-bootstrap';

const OPTIONS = [
  { value: 'food', label: 'Food', testID: 'mode-switch-food' },
  { value: 'gym', label: 'Gym', testID: 'mode-switch-gym' },
] as const;

/** Wait at most this long for a first bootstrap before giving up on the setup check. */
const SETUP_CHECK_TIMEOUT_MS = 4000;

/**
 * UX-GYM-20: the pill is derived from the route GROUP, not the pathname. The
 * pathname flickered to a Food-looking value on Gym tabs (Stats after "All
 * history", Exercises after a relaunch), so the pill said "Food" on Gym
 * screens. The first segment is `(gym)` for the Gym tabs and `gym` for every
 * deeper Gym stack screen (setup, settings, exercise, session, summary…);
 * anything else is Food. Bug B-14 still holds: never the persisted mode.
 */
export function modeFromSegments(segments: readonly string[]): AppMode {
  const first = segments[0];
  return first === '(gym)' || first === 'gym' ? 'gym' : 'food';
}

/**
 * Food | Gym segmented control (gym_plan.md D3) for the header of every
 * tab-root screen in both groups. Switching to Gym without a gym profile —
 * per the persisted bootstrap, fetched once if nothing is cached — opens
 * Setup on top of Today, so backing out of setup lands on Today.
 */
export function ModeSwitch({ className, mode }: { className?: string; mode?: AppMode }) {
  // Mobile UX revamp: the new shell has one tab bar and no Food|Gym modes;
  // this header row becomes its top bar (Back on pushed screens, the tab's
  // actions on tab roots) — see src/features/shell/shell-chrome.tsx.
  const shellV2 = useShellV2();
  if (shellV2) return <ShellTopBar className={className} />;
  // Gym-only screens pass `gym` so the pill never depends on route state
  // (UX-GYM-20); the rest read the route group.
  return mode ? (
    <ModeSwitchBody className={className} mode={mode} />
  ) : (
    <RouteDerivedModeSwitch className={className} />
  );
}

function RouteDerivedModeSwitch({ className }: { className?: string }) {
  const segments = useSegments();
  return <ModeSwitchBody className={className} mode={modeFromSegments(segments)} />;
}

function ModeSwitchBody({ className, mode }: { className?: string; mode: AppMode }) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const needsSetup = async (): Promise<boolean> => {
    let bootstrap = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
    // A cached "no profile" may be stale (setup finished on another device),
    // so re-check it too whenever we're online.
    if ((bootstrap?.profile ?? null) === null && onlineManager.isOnline()) {
      const fetched = queryClient.fetchQuery({
        ...gymBootstrapQueryOptions(queryClient, (input) =>
          utils.client.gym.bootstrap.query(input),
        ),
        staleTime: 0,
      });
      const timeout = new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), SETUP_CHECK_TIMEOUT_MS),
      );
      // Offline / slow / failed → fall back to what the cache said.
      bootstrap = (await Promise.race([fetched.catch(() => undefined), timeout])) ?? bootstrap;
    }
    return bootstrap?.profile === null;
  };

  // UX-X-11: a Gym switch that was waiting for setup is recorded the moment
  // the gym profile exists (setup finished on top of Today, which keeps this
  // pill mounted).
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe(() => {
      const bootstrap = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
      if (bootstrap) commitPendingGymMode(bootstrap.profile !== null);
    });
  }, [queryClient]);

  const onChange = (next: AppMode) => {
    // What was persisted before this tap (null = never chose, lands by jobs).
    const previous = hasChosenMode() ? getMode() : null;
    setMode(next);
    if (next === 'food') {
      // Explicit group: bare '/' also matches the guarded (auth)/index and
      // silently no-ops while signed in (caught by e2e/gym-mode, 2026-09-25).
      router.replace('/(food)');
      return;
    }
    router.replace('/today');
    void needsSetup().then((setup) => {
      // The user may have switched back while we waited.
      if (!setup || getMode() !== 'gym') return;
      // UX-X-11: Gym is not set up, so this tap must not become the persisted
      // landing — a food-only user who only peeked would reopen on "Set up your
      // training" every launch. Put the previous choice back; it is recorded
      // once setup completes.
      restoreMode(previous);
      deferGymMode();
      router.push('/gym/setup');
    });
  };

  // T-00.9 (UX-36 (1)): on a Gym route the gear opens the gym settings
  // stack screen; on a Food root it opens the new Settings hub.
  const openSettings = () => {
    router.push(mode === 'gym' ? '/gym/settings' : '/settings');
  };

  // The header row of every tab root: compact switch left, gear + profile right.
  return (
    <View className={cn('flex-row items-center justify-between', className)}>
      <SegmentedControl
        testID="mode-switch"
        accessibilityLabel="App mode"
        size="xs"
        options={OPTIONS}
        value={mode}
        onChange={onChange}
        className="min-w-36"
      />
      <View className="flex-row items-center">
        <Pressable
          testID="mode-switch-settings"
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={openSettings}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="settings-outline" size={22} color="#6b7280" />
        </Pressable>
        <HeaderAvatar />
      </View>
    </View>
  );
}
