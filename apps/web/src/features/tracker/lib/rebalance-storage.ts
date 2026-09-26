// Relative import (not `@/lib/analytics`): this module is unit-tested, and
// the web vitest setup resolves relative paths only.
import {
  isPendingFresh,
  mergePendingRebalance,
  type PendingRebalance,
  type RebalanceResultLike,
} from '@chefer/utils';
import { capture } from '../../../lib/analytics';

// ─── Pending-rebalance hand-off (F4 Snap-to-Log) ──────────────────────────────
// A rebalance happens as a side effect of logging (tracker save, quick-add,
// photo scan, cook-mode "Made it!"). Its banner + undo show where the log
// happened (tracker, cook mode) and on the meal-plan page. Nothing in the schema stores the swap pairs (wave-0 freeze),
// so the hand-off is client-side: the logging surface stores the result here,
// the meal-plan page reads it, and undo replays the previous recipes through
// the existing mealPlan.replaceRecipe path. Tradeoff: undo is per-device and
// expires — an accepted v1 limitation noted in the handoff.

// The pure rules live in @chefer/utils so web and mobile merge and word
// swaps identically (mobile landed the merge first — audit F-TRK-3-2).
export {
  isPendingFresh,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
  type RebalanceResultLike,
  type RebalanceSwapLike,
} from '@chefer/utils';

const STORAGE_KEY = 'chefer.rebalance.pending';

/** Fired on window after a log stored new swaps — banners re-read storage. */
export const REBALANCE_EVENT = 'chefer:rebalanced';

// ─── Storage (localStorage, guarded) ──────────────────────────────────────────

function safeGet(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingRebalance(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode etc. */
  }
}

export function readPendingRebalance(): PendingRebalance | null {
  const raw = safeGet();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingRebalance;
    if (!parsed.planId || !Array.isArray(parsed.swaps)) return null;
    if (!isPendingFresh(parsed)) {
      clearPendingRebalance();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * One call for every logging surface: fires the `week_rebalanced` analytics
 * event and MERGES the swap pairs into what is already pending (a second
 * rebalance used to overwrite the first, so its undo was lost — F-TRK-3-2),
 * then tells any mounted banner to refresh. Safe with null/no-op results.
 */
export function handleRebalanceResult(result: RebalanceResultLike | null | undefined): void {
  if (!result?.rebalanced || !result.planId || result.swaps.length === 0) return;
  capture('week_rebalanced');
  try {
    const merged: PendingRebalance | null = mergePendingRebalance(readPendingRebalance(), result);
    if (merged) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    else clearPendingRebalance();
    window.dispatchEvent(new Event(REBALANCE_EVENT));
  } catch {
    /* banner just won't show — the swaps themselves are already applied */
  }
}
