'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import {
  EXERCISE_BY_ID,
  type EquipmentProfile,
  type ExerciseMeta,
  type GymBootstrap,
} from '@chefer/types';
import { equipmentProfileOf, type ExerciseLookup } from '@chefer/utils';
import { libraryLookup, localDate, useGymBootstrap } from '../use-gym-bootstrap';
import { pendingFinishedDocs, useOutboxState } from '../workout/outbox';
import { getGymOwner, subscribeGymOwner } from '../workout/owner';
import { reconcileWithPending } from '../workout/use-active-workout';

const serverOwner = () => null;

/** Default kg inventory, used only when the profile could not be loaded (offline reload). */
export const FALLBACK_PROFILE: EquipmentProfile = {
  unit: 'KG',
  barWeightKg: 20,
  platePairsKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbellsKg: [
    2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50,
  ],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: true,
  microPlates: false,
};

/** Library lookup that falls back to the curated catalog (works before bootstrap loads). */
export function lookupWithCatalog(bootstrap: GymBootstrap | undefined): ExerciseLookup {
  const fromBootstrap = bootstrap ? libraryLookup(bootstrap) : null;
  return (id: string): ExerciseMeta | undefined => fromBootstrap?.(id) ?? EXERCISE_BY_ID.get(id);
}

/**
 * The gym read model for web pages: `gym.bootstrap` with finished workouts
 * still waiting in the outbox folded back in (a refetch before the upload
 * lands never rolls "next up" back). `ready` is false during SSR and the
 * hydration render (see useHasMounted), so pages render a skeleton first.
 */
export function useGymData(opts: { enabled?: boolean } = {}) {
  const hasMounted = useHasMounted();
  const query = useGymBootstrap(opts);
  const outboxState = useOutboxState();
  const owner = useSyncExternalStore(subscribeGymOwner, getGymOwner, serverOwner);
  const today = hasMounted ? localDate() : '';

  const data = useMemo(() => {
    if (!query.data || !today) return undefined;
    return reconcileWithPending(query.data, pendingFinishedDocs(outboxState, owner), today);
  }, [query.data, outboxState, owner, today]);

  const lookup = useMemo(() => lookupWithCatalog(data), [data]);
  const profile = useMemo(
    () => (data?.profile ? equipmentProfileOf(data.profile) : null),
    [data?.profile],
  );

  return {
    data,
    lookup,
    /** Engine inventory (null until the profile is known). */
    profile,
    unit: data?.profile?.unit ?? 'KG',
    today,
    hasMounted,
    ready: hasMounted && data !== undefined,
    isLoading: !hasMounted || query.isLoading,
    isError: hasMounted && query.isError && !data,
    error: query.error,
    refetch: query.refetch,
  };
}
