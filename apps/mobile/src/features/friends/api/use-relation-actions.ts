import { useQueryClient } from '@tanstack/react-query';
import type { Relation } from '@chefer/types';
import { trpc } from '../../../lib/trpc';
import { invalidateAfterRelationChange } from './invalidate';
import { applyRelation, rollbackFriendsCache } from './relation-cache';

// ─── Following: follow / unfollow with optimistic cache (UX §3.3, MO-08) ──────
// The cache flips first (every list, search page, suggestion, Activity item
// and profile showing that person), then the server answers. The server's
// `relation` is the truth: a Follow optimistically shown as `Following`
// settles on `Requested` if the profile went private meanwhile. On failure
// every touched query is put back exactly as it was.

export type RelationActionResult = { ok: true; relation: Relation } | { ok: false; error: unknown };

export type RelationActions = {
  /** `optimistic`: what to show until the server answers (`following` for a known-public profile, else `requested`). */
  follow: (userId: string, optimistic: 'following' | 'requested') => Promise<RelationActionResult>;
  /** Unfollow, or cancel a pending request. */
  unfollow: (userId: string) => Promise<RelationActionResult>;
};

export function useRelationActions(): RelationActions {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const followMutation = trpc.friends.follow.useMutation({ meta: { silent: true } });
  const unfollowMutation = trpc.friends.unfollow.useMutation({ meta: { silent: true } });

  const run = async (
    userId: string,
    optimistic: Relation,
    call: () => Promise<{ relation: Relation }>,
  ): Promise<RelationActionResult> => {
    const snapshot = applyRelation(queryClient, userId, { relation: optimistic });
    try {
      const { relation } = await call();
      // Re-apply even when equal: a list fetch that landed mid-flight may
      // have brought the old relation back.
      applyRelation(queryClient, userId, { relation });
      invalidateAfterRelationChange(utils, userId);
      return { ok: true, relation };
    } catch (error) {
      rollbackFriendsCache(queryClient, snapshot);
      return { ok: false, error };
    }
  };

  return {
    follow: (userId, optimistic) =>
      run(userId, optimistic, () => followMutation.mutateAsync({ userId })),
    unfollow: (userId) => run(userId, 'none', () => unfollowMutation.mutateAsync({ userId })),
  };
}
