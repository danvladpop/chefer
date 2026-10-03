import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '../../../lib/trpc';
import { invalidateAfterRequestAnswer } from './invalidate';
import {
  answerActivityRequest,
  applyRelation,
  mergeSnapshots,
  removePerson,
  rollbackFriendsCache,
} from './relation-cache';

// ─── Following: accept / decline a follow request (UX §5.1, §7) ───────────────
// Optimistic: the request row leaves `friends.requests` (MO-04), the person's
// summary flips `requestedYou` off (and `followsYou` on, for accept) wherever
// it is cached, and their Activity item reads `You accepted` / `You declined`.
// A failure restores all of it. The caller shows the snackbar
// (`FRIENDS_COPY.accepted.snackbar`) and the announcement.

export type AnswerResult = { ok: true } | { ok: false; error: unknown };

export function useAnswerRequest(): {
  accept: (userId: string) => Promise<AnswerResult>;
  decline: (userId: string) => Promise<AnswerResult>;
} {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const acceptMutation = trpc.friends.acceptRequest.useMutation({ meta: { silent: true } });
  const declineMutation = trpc.friends.declineRequest.useMutation({ meta: { silent: true } });

  const run = async (
    userId: string,
    answer: 'accepted' | 'declined',
    call: () => Promise<unknown>,
  ): Promise<AnswerResult> => {
    const snapshot = mergeSnapshots(
      removePerson(queryClient, userId, ['requests']),
      applyRelation(queryClient, userId, {
        requestedYou: false,
        ...(answer === 'accepted' ? { followsYou: true } : {}),
      }),
      answerActivityRequest(queryClient, userId, answer),
    );
    try {
      await call();
      invalidateAfterRequestAnswer(utils, userId);
      return { ok: true };
    } catch (error) {
      rollbackFriendsCache(queryClient, snapshot);
      return { ok: false, error };
    }
  };

  return {
    accept: (userId) => run(userId, 'accepted', () => acceptMutation.mutateAsync({ userId })),
    decline: (userId) => run(userId, 'declined', () => declineMutation.mutateAsync({ userId })),
  };
}
