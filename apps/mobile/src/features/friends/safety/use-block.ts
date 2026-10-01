import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '../../../lib/trpc';
import { invalidateAfterBlock } from '../api/invalidate';
import { removePerson } from '../api/relation-cache';

// ─── Following: block / unblock (UX §11.4, §11.6) ─────────────────────────────
// NOT optimistic: "Nothing is blocked until the server confirms" (UX §11.4).
// Once it does, the person leaves every cached people list at once and the
// namespace + recipe lists refetch (their recipes vanish from the cookbook).
// The caller confirms first (`FRIENDS_CONFIRMS.block`), then on success backs
// out of the profile from the sheet's `onDone` and shows
// `FRIENDS_COPY.block.done(first)`.

export type SafetyResult = { ok: true } | { ok: false; error: unknown };

export function useBlock(): {
  block: (userId: string) => Promise<SafetyResult>;
  isPending: boolean;
} {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const mutation = trpc.friends.block.useMutation();
  return {
    block: async (userId) => {
      try {
        await mutation.mutateAsync({ userId });
      } catch (error) {
        return { ok: false, error };
      }
      removePerson(queryClient, userId);
      invalidateAfterBlock(utils);
      return { ok: true };
    },
    isPending: mutation.isPending,
  };
}

/** Unblock from Blocked people: the row leaves `friends.blocked`; follows aren't restored. */
export function useUnblock(): {
  unblock: (userId: string) => Promise<SafetyResult>;
  isPending: boolean;
} {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const mutation = trpc.friends.unblock.useMutation();
  return {
    unblock: async (userId) => {
      try {
        await mutation.mutateAsync({ userId });
      } catch (error) {
        return { ok: false, error };
      }
      removePerson(queryClient, userId, ['blocked']);
      void utils.friends.me.invalidate();
      void utils.friends.blocked.invalidate(undefined, { refetchType: 'none' });
      void utils.friends.suggestions.invalidate(undefined, { refetchType: 'none' });
      void utils.recipe.list.invalidate();
      return { ok: true };
    },
    isPending: mutation.isPending,
  };
}
