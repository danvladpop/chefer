'use client';

import { useEffect, useState } from 'react';
import { handleRebalancePreview } from '@/features/tracker/lib/rebalance-storage';
import { trpc } from '@/lib/trpc';
import { localDateStr } from '@chefer/utils';

// ─── "Rebalance my week", only when asked (FB7-11) ────────────────────────────
// Week options → "Rebalance my week" asks the server what a rebalance WOULD do
// (`mealPlan.previewRebalance`, free, no AI). It never runs on its own: a week
// with nothing logged yet reads as "under target", and an unasked offer card
// would sit on top of the plan. A non-empty preview is parked with the same
// hand-off a log uses (`handleRebalancePreview`), so the existing
// `RebalanceBanner` shows the usual Preview · Apply · Not now card; nothing is
// applied until the user says so.

/** `idle` = unchecked, or an offer is now showing. */
export type RebalanceCheckState = 'idle' | 'loading' | 'on-track' | 'error';

export function useRebalanceCheck(planId: string | undefined): {
  state: RebalanceCheckState;
  /** Resolves with the resulting state (`idle` = an offer is now showing). */
  check: () => Promise<RebalanceCheckState>;
} {
  const utils = trpc.useUtils();
  const [state, setState] = useState<RebalanceCheckState>('idle');

  // Another plan (week navigation) starts unchecked.
  useEffect(() => setState('idle'), [planId]);

  const check = async (): Promise<RebalanceCheckState> => {
    if (state === 'loading' || planId === undefined) return state;
    setState('loading');
    try {
      const preview = await utils.mealPlan.previewRebalance.fetch(
        { planId, localDate: localDateStr() },
        { staleTime: 0 },
      );
      const hasOffer = preview !== null && preview !== undefined && preview.swaps.length > 0;
      handleRebalancePreview(hasOffer ? preview : null);
      const next: RebalanceCheckState = hasOffer ? 'idle' : 'on-track';
      setState(next);
      return next;
    } catch {
      setState('error');
      return 'error';
    }
  };
  return { state, check };
}
