import { useEffect, useRef, useState } from 'react';
import type { FinishCookInput, Receipt } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { newId } from '../gym/offline/ids';
import { enqueueCook } from './cook-queue';

// Cook mode's one Kitchen-progress call (build-plan.md Lane C §3). When a cook
// ends — whichever button ends it — `progress.finishCook` is called ONCE with
// the cook's own UUID, for EVERY user: the API records the cook whether or not
// Kitchen progress is switched on for them (D1), so history is complete the day
// it is. The gate decides only whether the receipt is SHOWN (cook/[id].tsx).
// A failed call is parked in the offline queue (cook-queue.ts) and retried on
// the next foreground by ProgressHost, idempotently (same id).

export interface UseFinishCook {
  /** The Kitchen receipt of this cook, once the API has answered (null while waiting, or when off). */
  receipt: Receipt | null;
  /** The cook's id (also the receipt's `sourceId`). */
  cookId: string;
}

export function useFinishCook({
  finished,
  recipeId,
}: {
  finished: boolean;
  recipeId: string | null;
}): UseFinishCook {
  const [cook] = useState(() => ({ id: newId(), startedAt: new Date() }));
  const sent = useRef(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const mutation = trpc.progress.finishCook.useMutation({
    meta: { silent: true },
    // Offline must fail fast into the queue, not pause until the app is killed.
    networkMode: 'always',
    onSuccess: (result) => setReceipt(result.receipt),
    // Hook-level, so it still runs when the cook screen has already been left.
    onError: (_error, variables) => enqueueCook(variables),
  });

  useEffect(() => {
    if (!finished || sent.current) return;
    sent.current = true;
    const input: FinishCookInput = {
      id: cook.id,
      recipeId,
      localDate: localDateStr(),
      startedAt: cook.startedAt,
      finishedAt: new Date(),
    };
    mutation.mutate(input);
    // `mutation` is a new object every render; the ref makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  return { receipt, cookId: cook.id };
}
