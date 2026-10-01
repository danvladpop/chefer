import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '../../../lib/trpc';
import { invalidateAfterRemoveFollower } from '../api/invalidate';
import {
  applyRelation,
  mergeSnapshots,
  removePerson,
  rollbackFriendsCache,
} from '../api/relation-cache';
import type { SafetyResult } from './use-block';

// ─── Following: remove a follower (UX §11.4) ──────────────────────────────────
// Optimistic: the row leaves `friends.followers` (MO-04) and `Follows you`
// disappears wherever the person is cached; a failure restores both. The
// caller confirms first (`FRIENDS_CONFIRMS.removeFollower`) and shows
// `FRIENDS_COPY.remove.done(first)`. They aren't told.

export function useRemoveFollower(): {
  removeFollower: (userId: string) => Promise<SafetyResult>;
  isPending: boolean;
} {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const mutation = trpc.friends.removeFollower.useMutation();
  return {
    removeFollower: async (userId) => {
      const snapshot = mergeSnapshots(
        removePerson(queryClient, userId, ['followers']),
        applyRelation(queryClient, userId, { followsYou: false }),
      );
      try {
        await mutation.mutateAsync({ userId });
      } catch (error) {
        rollbackFriendsCache(queryClient, snapshot);
        return { ok: false, error };
      }
      invalidateAfterRemoveFollower(utils, userId);
      return { ok: true };
    },
    isPending: mutation.isPending,
  };
}
