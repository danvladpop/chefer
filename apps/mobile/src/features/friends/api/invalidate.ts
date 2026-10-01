import type { trpc } from '../../../lib/trpc';

// ─── Following: what to refetch after a mutation ──────────────────────────────
// The optimistic writes in relation-cache.ts already show the result
// everywhere a person is cached. These helpers then reconcile with the
// server: the badge/counts (`me`) and the affected profile refetch now; the
// people lists are only marked stale (`refetchType: 'none'`), so a row the
// user just acted on stays in place with its new state until the next pull
// to refresh or mount (UX §5.1 "keeps the row in place … until the next
// refresh") instead of jumping out from under their finger.

export type FriendsUtils = ReturnType<typeof trpc.useUtils>;

const STALE_ONLY = { refetchType: 'none' } as const;

/** After follow / unfollow / cancel request. */
export function invalidateAfterRelationChange(utils: FriendsUtils, userId: string): void {
  void utils.friends.me.invalidate();
  void utils.friends.profile.invalidate({ userId });
  void utils.friends.following.invalidate(undefined, STALE_ONLY);
  void utils.friends.suggestions.invalidate(undefined, STALE_ONLY);
  void utils.friends.search.invalidate(undefined, STALE_ONLY);
}

/** After accept / decline of a follow request. */
export function invalidateAfterRequestAnswer(utils: FriendsUtils, userId: string): void {
  void utils.friends.me.invalidate();
  void utils.friends.profile.invalidate({ userId });
  void utils.friends.requests.invalidate(undefined, STALE_ONLY);
  void utils.friends.followers.invalidate(undefined, STALE_ONLY);
  void utils.friends.activity.invalidate(undefined, STALE_ONLY);
}

/** After remove follower. */
export function invalidateAfterRemoveFollower(utils: FriendsUtils, userId: string): void {
  void utils.friends.me.invalidate();
  void utils.friends.profile.invalidate({ userId });
  void utils.friends.followers.invalidate(undefined, STALE_ONLY);
}

/**
 * After block or report (which also blocks). The person disappears from
 * everything, including their recipes in the viewer's cookbook (`recipe.list`
 * rows with `creator`), so the whole namespace and the recipe lists refetch.
 */
export function invalidateAfterBlock(utils: FriendsUtils, userId: string): void {
  // The blocked person's own queries (profile, week, recipes, routine,
  // workouts) are only marked stale: refetching them now answers NOT_FOUND,
  // which would swap the open profile to "Profile not available" and unmount
  // the sheet before its onExited runs — no snackbar, no navigation back.
  // They refetch on the next mount.
  const isTheirs = (query: { queryKey: readonly unknown[] }) =>
    queryUserId(query.queryKey) === userId;
  void utils.friends.invalidate(undefined, { predicate: (query) => !isTheirs(query) });
  void utils.friends.invalidate(undefined, { predicate: isTheirs, refetchType: 'none' });
  void utils.recipe.list.invalidate();
}

/** The `userId` input of a tRPC query key (`[path, { input, type }]`), if any. */
function queryUserId(queryKey: readonly unknown[]): string | undefined {
  const meta = queryKey[1];
  if (typeof meta !== 'object' || meta === null || !('input' in meta)) return undefined;
  const input = (meta as { input?: unknown }).input;
  if (typeof input !== 'object' || input === null || !('userId' in input)) return undefined;
  const id = (input as { userId?: unknown }).userId;
  return typeof id === 'string' ? id : undefined;
}
