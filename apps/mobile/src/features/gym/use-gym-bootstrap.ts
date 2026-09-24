import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { applyFinishedSession, type ExerciseLookup } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { localDate } from './offline/ids';
import { outbox } from './offline/outbox';
import { getGymOwner } from './offline/owner';
import { GYM_QUERY_GC_TIME } from './offline/query-persistence';

// The gym read model (gym_plan.md §4.1/§5.2): one persisted `gym.bootstrap`
// query that Today, Routine, the workout and the food dashboard card all read.
//
// The query key is deliberately INPUT-FREE ([['gym','bootstrap'],{type:'query'}]):
// the input carries the device's `today`, and a date in the key would miss the
// persisted cache every morning — exactly when the phone is offline in a gym.
// `utils.gym.bootstrap.invalidate()` still matches it (prefix).

export const gymBootstrapQueryKey = getQueryKey(trpc.gym.bootstrap, undefined, 'query');

export type BootstrapInput = { today: string; librarySince?: string };
export type BootstrapFetcher = (input: BootstrapInput) => Promise<GymBootstrap>;

export function libraryLookup(bootstrap: GymBootstrap): ExerciseLookup {
  const byId = new Map(bootstrap.library.map((exercise) => [exercise.id, exercise]));
  return (id) => byId.get(id);
}

/**
 * Folds a `librarySince` delta into the cached library: rows in `next.library`
 * replace same-id rows (edits, archives), new ids are appended, untouched
 * cached rows are kept. Everything else comes from `next`.
 */
export function mergeBootstrap(
  prev: GymBootstrap | undefined,
  next: GymBootstrap,
  wasDelta: boolean,
): GymBootstrap {
  if (!prev || !wasDelta) return next;
  const byId = new Map(prev.library.map((exercise) => [exercise.id, exercise]));
  for (const exercise of next.library) byId.set(exercise.id, exercise);
  return { ...next, library: [...byId.values()] };
}

/**
 * Re-applies finished workouts that are still in the outbox (not yet acked,
 * so absent from the server's recentSessions) on top of a server bootstrap —
 * a bootstrap fetched while the upload is still pending must not roll "next
 * up" back. Engine failures leave the server copy untouched.
 */
export function reconcileWithPending(
  bootstrap: GymBootstrap,
  pending: readonly WorkoutSessionDoc[],
  today: string,
): GymBootstrap {
  if (!bootstrap.profile) return bootstrap;
  const known = new Set(bootstrap.recentSessions.map((s) => s.id));
  const missing = pending
    .filter((doc) => doc.status === 'COMPLETED' && !known.has(doc.id))
    .sort((a, b) => (a.finishedAt ?? a.startedAt).localeCompare(b.finishedAt ?? b.startedAt));
  let current = bootstrap;
  for (const doc of missing) {
    try {
      current = applyFinishedSession({
        bootstrap: current,
        doc,
        lookup: libraryLookup(current),
        facts: { experience: bootstrap.profile.experience, ageYears: null },
        today,
      });
    } catch {
      return current;
    }
  }
  return current;
}

/** Finished docs in the outbox that belong to the signed-in user and will be sent. */
export function pendingFinishedDocs(): WorkoutSessionDoc[] {
  const owner = getGymOwner();
  return outbox
    .getState()
    .entries.filter(
      (e) =>
        !e.parkedReason &&
        e.doc.status === 'COMPLETED' &&
        (e.ownerId === null || owner === null || e.ownerId === owner),
    )
    .map((e) => e.doc);
}

export function gymBootstrapQueryOptions(queryClient: QueryClient, fetcher: BootstrapFetcher) {
  return {
    queryKey: gymBootstrapQueryKey,
    queryFn: async (): Promise<GymBootstrap> => {
      const prev = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
      const since = prev?.libraryCursor;
      const today = localDate();
      const next = await fetcher(since ? { today, librarySince: since } : { today });
      const merged = mergeBootstrap(prev, next, since !== undefined);
      return reconcileWithPending(merged, pendingFinishedDocs(), today);
    },
    staleTime: 60_000,
    gcTime: GYM_QUERY_GC_TIME,
    networkMode: 'offlineFirst' as const,
  };
}

/**
 * The persisted bootstrap. Offline it serves the cached copy (up to 30 days);
 * with no cache and no connection, `data` is undefined and `fetchStatus` is
 * 'paused'/'idle' — show "the first sync needs a connection".
 */
export function useGymBootstrap(options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  return useQuery({
    ...gymBootstrapQueryOptions(queryClient, (input) => utils.client.gym.bootstrap.query(input)),
    enabled: options.enabled ?? true,
  });
}

/**
 * Optimistic "next workout" after Finish (gym_plan.md §5.2): fold the doc into
 * the cached bootstrap with the shared engine. Cancels an in-flight bootstrap
 * fetch first so a response computed before the upload can't overwrite it.
 * Returns false when there is nothing cached to fold into (or the engine threw).
 */
export async function applyFinishedLocally(
  queryClient: QueryClient,
  doc: WorkoutSessionDoc,
  today: string = localDate(),
): Promise<boolean> {
  await queryClient.cancelQueries({ queryKey: gymBootstrapQueryKey });
  const bootstrap = queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey);
  if (!bootstrap?.profile) return false;
  try {
    const next = applyFinishedSession({
      bootstrap,
      doc,
      lookup: libraryLookup(bootstrap),
      facts: { experience: bootstrap.profile.experience, ageYears: null },
      today,
    });
    queryClient.setQueryData(gymBootstrapQueryKey, next);
    return true;
  } catch {
    return false;
  }
}

/** Hook form of applyFinishedLocally bound to the app's QueryClient. */
export function useApplyFinishedLocally(): (doc: WorkoutSessionDoc) => Promise<boolean> {
  const queryClient = useQueryClient();
  return useCallback((doc) => applyFinishedLocally(queryClient, doc), [queryClient]);
}
