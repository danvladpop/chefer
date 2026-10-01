import type { QueryKey } from '@tanstack/react-query';
import type { RouterOutputs } from '../../../lib/trpc';

// ─── Following: query keys (implementation-plan §7, INV-7) ────────────────────
// Every piece of friend data lives under the `friends` tRPC namespace, so its
// TanStack key starts with `['friends', <procedure>]` (tRPC v11 key shape:
// `[path[], { input?, type? }]`). It must NEVER start with `gym`: the gym
// offline layer (`query-persistence.ts`, `isGymQueryKey`) writes every
// `gym.*` query to disk for 30 days, and other people's data must not be
// persisted (INV-7). `friends-core-query-keys.test.ts` asserts this.
//
// Prefer `trpc.useUtils().friends.<proc>` for invalidation; these raw keys
// exist for the cross-list cache walker (`relation-cache.ts`), which has to
// touch every friends query at once whatever its input.

/** The tRPC namespace. User-facing name "Following"; the code name stays `friends`. */
export const FRIENDS_NAMESPACE = 'friends' as const;

type FriendsOutputs = RouterOutputs['friends'];

/**
 * The `friends.*` queries (not mutations). `satisfies` keeps the list honest
 * against the router: a renamed procedure fails the typecheck here.
 */
export const FRIENDS_QUERY_PROCEDURES = [
  'availability',
  'me',
  'search',
  'suggestions',
  'following',
  'followers',
  'requests',
  'activity',
  'blocked',
  'profile',
  'week',
  'recipes',
  'routine',
  'workouts',
] as const satisfies readonly (keyof FriendsOutputs)[];

export type FriendsQueryProcedure = (typeof FRIENDS_QUERY_PROCEDURES)[number];

/** The lists a person can appear in as a row (`FriendUserSummary` items). */
export const FRIENDS_PEOPLE_LISTS = [
  'search',
  'suggestions',
  'following',
  'followers',
  'requests',
  'activity',
  'blocked',
] as const satisfies readonly FriendsQueryProcedure[];

export type FriendsPeopleList = (typeof FRIENDS_PEOPLE_LISTS)[number];

/** Partially matches every `friends.*` query (all procedures, all inputs). */
export const FRIENDS_QUERY_KEY_PREFIX: QueryKey = [[FRIENDS_NAMESPACE]];

/** Partially matches every query of one `friends.*` procedure, whatever its input. */
export function friendsQueryKey(procedure: FriendsQueryProcedure): QueryKey {
  return [[FRIENDS_NAMESPACE, procedure]];
}

/** True for any `friends.*` tRPC query key. */
export function isFriendsQueryKey(queryKey: QueryKey): boolean {
  const path = queryKey[0];
  return Array.isArray(path) && path[0] === FRIENDS_NAMESPACE;
}

/** The procedure a `friends.*` key belongs to, or null for any other key. */
export function friendsProcedureOf(queryKey: QueryKey): string | null {
  const path = queryKey[0];
  if (!Array.isArray(path) || path[0] !== FRIENDS_NAMESPACE) return null;
  return typeof path[1] === 'string' ? path[1] : null;
}
