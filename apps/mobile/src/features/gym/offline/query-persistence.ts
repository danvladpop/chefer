import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { ENGINE_VERSION } from '@chefer/utils';
import { KV_KEYS } from './keys';
import { kvAsyncStorage } from './kv';

// Read-model persistence (gym_plan.md §5.2): gym.* tRPC queries are written to
// disk, so the Today tab, next workout and history render offline. WP-11
// (UX-SHOP-06, audit PO-07) adds the four reads a supermarket basement needs:
// the Shop list, the week's plan, a recipe (cook mode) and the user's units —
// see OFFLINE_FOOD_QUERIES. Every other food query stays memory-only.

/**
 * Bump when the persisted cache shape changes; ENGINE_VERSION bumps on its
 * own. 2 (T-42.3): the client moved to x-chefer-api-level 3, so a persisted
 * library cache filtered under the old level (no cardio rows) must be
 * dropped for a full re-bootstrap (Δ2.1).
 */
export const GYM_CACHE_SCHEMA_VERSION = 2;
export const GYM_CACHE_BUSTER = `${ENGINE_VERSION}:${GYM_CACHE_SCHEMA_VERSION}`;
export const GYM_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** tRPC query keys look like [['gym', 'bootstrap'], { input, type }]. */
export function isGymQueryKey(queryKey: QueryKey): boolean {
  const path = queryKey[0];
  return Array.isArray(path) && path[0] === 'gym';
}

/**
 * The food reads that survive a cold start offline (UX-SHOP-06): the Shop tab,
 * the plan behind it, a recipe for cook mode, and `preferredUnits` (so an
 * imperial user does not see grams offline). tRPC path = [router, procedure].
 */
export const OFFLINE_FOOD_QUERIES: readonly (readonly [string, string])[] = [
  ['shoppingList', 'getForWeek'],
  ['mealPlan', 'getForWeek'],
  ['recipe', 'get'],
  ['preferences', 'get'],
];

/** Food reads are kept for a week — a stale supermarket list beats an empty screen, but not for a month. */
export const FOOD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isOfflineFoodQueryKey(queryKey: QueryKey): boolean {
  const path = queryKey[0];
  return (
    Array.isArray(path) &&
    OFFLINE_FOOD_QUERIES.some(([router, procedure]) => path[0] === router && path[1] === procedure)
  );
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
  return (
    query.state.status === 'success' &&
    (isGymQueryKey(query.queryKey) || isOfflineFoodQueryKey(query.queryKey))
  );
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
  // The persisted food reads behave the same: cache first, retried in the
  // background, never garbage-collected before the persister's 7-day maxAge.
  for (const [router, procedure] of OFFLINE_FOOD_QUERIES) {
    queryClient.setQueryDefaults([[router, procedure]], {
      networkMode: 'offlineFirst',
      gcTime: GYM_QUERY_GC_TIME,
    });
  }
}

type PersistedShape = {
  clientState: { queries: { queryKey: QueryKey; state: { dataUpdatedAt: number } }[] };
};

/**
 * Drops food reads older than `FOOD_CACHE_MAX_AGE_MS` from a restored cache.
 * TanStack's own `maxAge` is one number for the whole blob (30 days, for the
 * gym), so the shorter food window is applied entry by entry here.
 */
export function dropExpiredFoodQueries<T extends PersistedShape>(
  persisted: T,
  now: number = Date.now(),
): T {
  const queries = persisted.clientState.queries.filter(
    (q) =>
      !isOfflineFoodQueryKey(q.queryKey) || now - q.state.dataUpdatedAt <= FOOD_CACHE_MAX_AGE_MS,
  );
  return { ...persisted, clientState: { ...persisted.clientState, queries } };
}

export function createGymPersistOptions(): Omit<PersistQueryClientOptions, 'queryClient'> {
  const base = createAsyncStoragePersister({
    storage: kvAsyncStorage,
    key: KV_KEYS.queryCache,
    throttleTime: 1000,
  });
  return {
    persister: {
      ...base,
      restoreClient: async () => {
        const restored = await base.restoreClient();
        return restored ? dropExpiredFoodQueries(restored) : restored;
      },
    },
    maxAge: GYM_CACHE_MAX_AGE_MS,
    buster: GYM_CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: shouldPersistQuery,
      shouldDehydrateMutation: () => false,
    },
  };
}

/**
 * Drop every persisted read — gym and the offline food reads (sign-out /
 * account switch). The persisted copy follows. The name is historical.
 */
export function clearGymQueries(queryClient: QueryClient): void {
  const predicate = (query: { queryKey: QueryKey }) =>
    isGymQueryKey(query.queryKey) || isOfflineFoodQueryKey(query.queryKey);
  // Mounted screens (the dashboard card, a gym tab) must not keep rendering
  // the old account's data: reset clears it AND refetches active observers;
  // remove then drops the inactive rest (and, via the persister, the disk copy).
  void queryClient.resetQueries({ predicate, type: 'active' });
  queryClient.removeQueries({ predicate, type: 'inactive' });
}
