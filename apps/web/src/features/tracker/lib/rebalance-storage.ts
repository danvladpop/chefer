// Relative import (not `@/lib/analytics`): this module is unit-tested, and
// the web vitest setup resolves relative paths only.
import { capture } from '../../../lib/analytics';

// ─── Pending-rebalance hand-off (F4 Snap-to-Log) ──────────────────────────────
// A rebalance happens as a side effect of logging (tracker save, quick-add,
// photo scan, cook-mode "Made it!"), but its banner + undo live on the
// meal-plan page. Nothing in the schema stores the swap pairs (wave-0 freeze),
// so the hand-off is client-side: the logging surface stores the result here,
// the meal-plan page reads it, and undo replays the previous recipes through
// the existing mealPlan.replaceRecipe path. Tradeoff: undo is per-device and
// expires — an accepted v1 limitation noted in the handoff.

export interface RebalanceSwapLike {
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  mealType: string;
  previousRecipeId: string;
  newRecipeId: string;
  previousRecipeName?: string | undefined;
  newRecipeName?: string | undefined;
}

export interface RebalanceResultLike {
  rebalanced: boolean;
  swaps: RebalanceSwapLike[];
  projectedDeviation: number;
  planId?: string | undefined;
}

export interface PendingRebalance {
  planId: string;
  swaps: RebalanceSwapLike[];
  createdAt: number; // epoch ms
}

const STORAGE_KEY = 'chefer.rebalance.pending';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // stale after a day — the week moved on

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** "I adjusted Thursday dinner to keep your week on track" (+ "and Friday lunch"). */
export function rebalanceBannerCopy(swaps: RebalanceSwapLike[]): string {
  const parts = swaps.map((s) => `${DAY_NAMES[s.dayOfWeek] ?? 'a coming day'} ${s.mealType}`);
  if (parts.length === 0) return '';
  const joined =
    parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
  return `I adjusted ${joined} to keep your week on track.`;
}

/**
 * The mealPlan.replaceRecipe calls that restore the pre-rebalance plan —
 * one per swap, each putting previousRecipeId back into its slot.
 */
export function undoOperations(
  pending: PendingRebalance,
): { planId: string; dayOfWeek: number; mealType: string; recipeId: string }[] {
  return pending.swaps.map((swap) => ({
    planId: pending.planId,
    dayOfWeek: swap.dayOfWeek,
    mealType: swap.mealType,
    recipeId: swap.previousRecipeId,
  }));
}

/** Whether a stored hand-off is still worth showing. */
export function isPendingFresh(pending: PendingRebalance, now: number = Date.now()): boolean {
  return pending.swaps.length > 0 && now - pending.createdAt < EXPIRY_MS;
}

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
 * event and stores the swap pairs for the meal-plan banner + undo. Safe to
 * call with null/undefined/no-op results.
 */
export function handleRebalanceResult(result: RebalanceResultLike | null | undefined): void {
  if (!result?.rebalanced || !result.planId || result.swaps.length === 0) return;
  capture('week_rebalanced');
  try {
    const pending: PendingRebalance = {
      planId: result.planId,
      swaps: result.swaps,
      createdAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    /* banner just won't show — the swaps themselves are already applied */
  }
}
