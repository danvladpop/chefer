import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { ENGINE_VERSION } from '@chefer/utils';
import { KV_KEYS } from './keys';
import { kvAsyncStorage } from './kv';

// Read-model persistence (gym_plan.md §5.2): ONLY gym.* tRPC queries are
// written to disk, so the Today tab, next workout and history render offline.
// Food queries stay memory-only exactly as before.

/** Bump when the persisted cache shape changes; ENGINE_VERSION bumps on its own. */
export const GYM_CACHE_SCHEMA_VERSION = 1;
export const GYM_CACHE_BUSTER = `${ENGINE_VERSION}:${GYM_CACHE_SCHEMA_VERSION}`;
export const GYM_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** tRPC query keys look like [['gym', 'bootstrap'], { input, type }]. */
export function isGymQueryKey(queryKey: QueryKey): boolean {
  const path = queryKey[0];
  return Array.isArray(path) && path[0] === 'gym';
}

/** Prefix that partially matches every gym.* tRPC query key. */
export const GYM_QUERY_KEY_PREFIX: QueryKey = [['gym']];

/**
 * Structural param type on purpose: the persist-client package pins a
 * different @tanstack/query-core patch than react-query, and the two `Query`
 * classes are nominally incompatible.
 */
export function shouldPersistQuery(query: {
  queryKey: QueryKey;
  state: { status: string };
}): boolean {
  return query.state.status === 'success' && isGymQueryKey(query.queryKey);
}

/**
 * gcTime for gym queries. It must be ≥ maxAge or restored data is
 * garbage-collected before anyone reads it — but 30 days in ms overflows the
 * 32-bit timer limit (setTimeout clamps it to ~1 ms and the cache evaporates),
 * so it is Infinity (no GC timer). Expiry is the persister's maxAge instead.
 */
export const GYM_QUERY_GC_TIME = Number.POSITIVE_INFINITY;

/** Gym queries serve the cache first and never go "paused" offline. */
export function applyGymQueryDefaults(queryClient: QueryClient): void {
  queryClient.setQueryDefaults(GYM_QUERY_KEY_PREFIX, {
    networkMode: 'offlineFirst',
    gcTime: GYM_QUERY_GC_TIME,
  });
}

export function createGymPersistOptions(): Omit<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister: createAsyncStoragePersister({
      storage: kvAsyncStorage,
      key: KV_KEYS.queryCache,
      throttleTime: 1000,
    }),
    maxAge: GYM_CACHE_MAX_AGE_MS,
    buster: GYM_CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: shouldPersistQuery,
      shouldDehydrateMutation: () => false,
    },
  };
}

/** Drop every cached gym read (sign-out / account switch). Persisted copy follows. */
export function clearGymQueries(queryClient: QueryClient): void {
  const predicate = (query: { queryKey: QueryKey }) => isGymQueryKey(query.queryKey);
  // Mounted screens (the dashboard card, a gym tab) must not keep rendering
  // the old account's data: reset clears it AND refetches active observers;
  // remove then drops the inactive rest (and, via the persister, the disk copy).
  void queryClient.resetQueries({ predicate, type: 'active' });
  queryClient.removeQueries({ predicate, type: 'inactive' });
}
