import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { localDateStr } from '@chefer/utils';
import { useFlags } from '../../hooks/use-flags';
import { track } from '../../lib/analytics';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import type { TodayActivity } from './health-model';
import { getHealthStore, type HealthStore } from './health-store';
import { mealsFromDay, runWeightImport, syncNutritionDay, useHealthSettings } from './health-sync';

// Health sync (C2), the React side: whether this phone can sync at all, the
// root host that runs the background jobs, and Today's device-only activity.

export type HealthAvailability =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'available'; store: HealthStore };

/**
 * `available` only with the `healthSync` flag on, a binary that has the
 * health SDK, and the store usable on this phone (Health Connect installed /
 * HealthKit supported). Everything else hides the feature.
 */
export function useHealthAvailability(): HealthAvailability {
  const { healthSync } = useFlags();
  const store = healthSync ? getHealthStore() : null;
  const [usable, setUsable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    store
      .isAvailable()
      .then((ok) => alive && setUsable(ok))
      .catch(() => alive && setUsable(false));
    return () => {
      alive = false;
    };
  }, [store]);

  if (!store) return { status: 'unavailable' };
  if (usable === null) return { status: 'checking' };
  return usable ? { status: 'available', store } : { status: 'unavailable' };
}

type TrackerDay = RouterOutputs['tracker']['getDay'];

/**
 * Root host: imports weigh-ins on launch and on every return to the
 * foreground, and mirrors each loaded `tracker.getDay` into the store (every
 * log, edit or delete refetches the day, so this follows them all). Only the
 * types the user turned on run.
 */
export function useHealthSyncJobs(signedIn: boolean): void {
  const { healthSync } = useFlags();
  const settings = useHealthSettings();
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const enabled = signedIn && healthSync;
  const weightOn = enabled && (settings?.types.includes('weight') ?? false);
  const nutritionOn = enabled && (settings?.types.includes('nutrition') ?? false);

  useEffect(() => {
    if (!weightOn) return;
    const store = getHealthStore();
    if (!store) return;
    let running = false;
    const run = () => {
      if (running) return;
      running = true;
      runWeightImport(store, (input) => utils.client.tracker.importWeights.mutate(input))
        .then((result) => {
          if (result.imported === 0) return;
          track('health_weights_imported', { platform: store.platform, ...result });
          // Same refresh as a logged weigh-in.
          void utils.tracker.weightHistory.invalidate();
          void utils.gym.stats.bodyweight.invalidate();
          void utils.gym.bootstrap.invalidate();
        })
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    };
    run();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') run();
    });
    return () => subscription.remove();
  }, [weightOn, utils]);

  useEffect(() => {
    if (!nutritionOn) return;
    const store = getHealthStore();
    if (!store) return;
    // What each day last looked like when written: a refetch that changed nothing writes nothing.
    const written = new Map<string, string>();
    let queue = Promise.resolve();
    const mirror = (day: TrackerDay) => {
      const fingerprint = JSON.stringify(mealsFromDay(day));
      if (written.get(day.date) === fingerprint) return;
      written.set(day.date, fingerprint);
      queue = queue
        .then(() => syncNutritionDay(store, day))
        .catch(() => {
          written.delete(day.date);
        });
    };
    const dayKey = getQueryKey(trpc.tracker.getDay);
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      for (const [, day] of queryClient.getQueriesData<TrackerDay>({ queryKey: dayKey })) {
        if (day) mirror(day);
      }
    });
    // Turning food on covers today right away, not only the next log.
    const today = localDateStr();
    utils.tracker.getDay
      .fetch({ date: today })
      .then(mirror)
      .catch(() => undefined);
    return unsubscribe;
  }, [nutritionOn, utils, queryClient]);
}

/** Renders nothing; mounts `useHealthSyncJobs` inside the tRPC provider. */
export function HealthSyncHost({ signedIn }: { signedIn: boolean }): null {
  useHealthSyncJobs(signedIn);
  return null;
}

/**
 * Today's steps and active energy, read on the device each time the screen
 * shows or the app comes back. Null while neither type is on. Never sent to
 * the API and never added to food targets (owner decision, C2).
 */
export function useTodayActivity(): TodayActivity | null {
  const { healthSync } = useFlags();
  const settings = useHealthSettings();
  const stepsOn = settings?.types.includes('steps') ?? false;
  const energyOn = settings?.types.includes('activeEnergy') ?? false;
  const on = healthSync && (stepsOn || energyOn);
  const [activity, setActivity] = useState<TodayActivity | null>(null);

  useEffect(() => {
    const store = on ? getHealthStore() : null;
    if (!store) {
      setActivity(null);
      return;
    }
    let alive = true;
    const read = () => {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      store
        .readTodayActivity(dayStart)
        .then((a) => {
          if (!alive) return;
          setActivity({
            steps: stepsOn ? a.steps : null,
            activeKcal: energyOn ? a.activeKcal : null,
          });
        })
        .catch(() => undefined);
    };
    read();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') read();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [on, stepsOn, energyOn]);

  return on ? activity : null;
}
