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
export function invalidateAfterBlock(utils: FriendsUtils): void {
  void utils.friends.invalidate();
  void utils.recipe.list.invalidate();
}
