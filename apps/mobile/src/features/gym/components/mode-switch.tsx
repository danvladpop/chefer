import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap } from '@chefer/types';
import { SegmentedControl } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { getMode, setMode, useMode, type AppMode } from '../mode-store';
import { gymBootstrapQueryKey, gymBootstrapQueryOptions } from '../use-gym-bootstrap';

const OPTIONS = [
  { value: 'food', label: 'Food', testID: 'mode-switch-food' },
  { value: 'gym', label: 'Gym', testID: 'mode-switch-gym' },
] as const;

/** Wait at most this long for a first bootstrap before giving up on the setup check. */
const SETUP_CHECK_TIMEOUT_MS = 4000;

/**
 * Food | Gym segmented control (gym_plan.md D3) for the header of every
 * tab-root screen in both groups. Switching to Gym without a gym profile —
 * per the persisted bootstrap, fetched once if nothing is cached — opens
 * Setup on top of Today, so backing out of setup lands on Today.
 */
export function ModeSwitch({ className }: { className?: string }) {
  const mode = useMode();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const needsSetup = async (): Promise<boolean> => {
    let bootstrap = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
    if (!bootstrap && onlineManager.isOnline()) {
      const fetched = queryClient.fetchQuery(
        gymBootstrapQueryOptions(queryClient, (input) => utils.client.gym.bootstrap.query(input)),
      );
      const timeout = new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), SETUP_CHECK_TIMEOUT_MS),
      );
      bootstrap = await Promise.race([fetched.catch(() => undefined), timeout]);
    }
    return bootstrap?.profile === null;
  };

  const onChange = (next: AppMode) => {
    setMode(next);
    if (next === 'food') {
      router.replace('/');
      return;
    }
    router.replace('/today');
    void needsSetup().then((setup) => {
      // The user may have switched back while we waited.
      if (setup && getMode() === 'gym') router.push('/gym/setup');
    });
  };

  return (
    <SegmentedControl
      testID="mode-switch"
      accessibilityLabel="App mode"
      size="sm"
      options={OPTIONS}
      value={mode}
      onChange={onChange}
      className={cn('w-40 self-start', className)}
    />
  );
}
