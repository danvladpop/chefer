'use client';

import { useEffect, useRef } from 'react';
import { newId } from '@/features/gym/workout/ids';
import { trpc } from '@/lib/trpc';
import type { FinishCookResult } from '@chefer/types';
import { Biscuit } from '@chefer/ui';
import { biscuitLine, localDateStr } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';
import { KitchenReceipt } from './kitchen-receipt';
import { useProgressSummary } from './use-progress';

// ─── Cook mode → Kitchen progress (mockup 02, lane C3) ────────────────────────
// `useFinishCook` records the cook once per cook-mode visit, for everyone and
// whether or not Kitchen progress is on (D1: the ledger starts recording at
// deploy). The id is a client UUID, so a retry can't double-count. The receipt
// is only drawn when the gate is on and the server sent one.

export function useFinishCook(recipeId: string, finished: boolean) {
  const startedAt = useRef(new Date());
  const sent = useRef(false);
  const finish = trpc.progress.finishCook.useMutation({
    meta: { silent: true },
    // Idempotent on the client id, so a couple of retries are safe.
    retry: 2,
  });
  const { mutate } = finish;
  useEffect(() => {
    if (!finished || sent.current) return;
    sent.current = true;
    mutate({
      id: newId(),
      recipeId,
      localDate: localDateStr(),
      startedAt: startedAt.current,
      finishedAt: new Date(),
    });
  }, [finished, mutate, recipeId]);
  return finish;
}

/**
 * The receipt block of the finish screen. The finish call lives in the page
 * (`useFinishCook`), not here, so going Back to steps and finishing again
 * doesn't record a second cook.
 */
export function CookFinishedProgress({ result }: { result: FinishCookResult | undefined }) {
  const { enabled, summary } = useProgressSummary();
  const receipt = result?.receipt ?? null;
  if (!enabled || !summary || !receipt || !summary.settings.showXp) return null;

  const { settings, quiet } = summary;
  // Biscuit's cameo: off when he's switched off, in quiet mode, or celebrations are off.
  const showBiscuit = settings.biscuit && !quiet && settings.celebrations !== 'OFF';

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3" data-testid="cook-progress">
      {showBiscuit && (
        <div className="flex flex-col items-center gap-1">
          <Biscuit loop="cooking" size={96} label={null} />
          <p
            data-testid="cook-biscuit-line"
            className="rounded-full bg-[#fff3e8] px-4 py-2 text-sm text-gray-800"
          >
            “{biscuitLine('cookFinished', receipt.sourceId)}” — Biscuit
          </p>
        </div>
      )}
      {receipt.meta.cookCount !== undefined && (
        <p className="text-sm text-gray-600">
          {PROGRESS_WEB_COPY.cookCountLine(receipt.meta.cookCount, receipt.meta.mealType)}
        </p>
      )}
      <KitchenReceipt receipt={receipt} level={summary.xp} />
    </div>
  );
}
