// ─── Week-rebalance undo hand-off (F4 Snap-to-Log, audit TRK-3) ───────────────
// A premium log (tracker save, quick add, photo scan, cook-mode "Made it!")
// can swap future meals to keep the week on target. Nothing in the schema
// stores the swap pairs, so each client keeps them locally and undo replays
// the previous recipes through mealPlan.replaceRecipe. Pure helpers only —
// the storage itself is per-platform (localStorage on web, KV on mobile).

export interface RebalanceSwapLike {
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  mealType: string;
  previousRecipeId: string;
  newRecipeId: string;
  previousRecipeName?: string | undefined;
  newRecipeName?: string | undefined;
}

/** Structural mirror of the API's RebalanceResult (meal-plan/rebalance). */
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

/** A hand-off goes stale after a day — the week has moved on. */
export const REBALANCE_UNDO_EXPIRY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "I adjusted Thursday dinner to keep your week on track" (+ "and Friday lunch"). */
export function rebalanceBannerCopy(swaps: RebalanceSwapLike[]): string {
  const parts = swaps.map((s) => `${DAY_NAMES[s.dayOfWeek] ?? 'a coming day'} ${s.mealType}`);
  if (parts.length === 0) return '';
  const lastPart = parts[parts.length - 1] ?? '';
  const joined = parts.length === 1 ? lastPart : `${parts.slice(0, -1).join(', ')} and ${lastPart}`;
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
  return pending.swaps.length > 0 && now - pending.createdAt < REBALANCE_UNDO_EXPIRY_MS;
}

/**
 * Folds a fresh rebalance result into whatever is already pending, so a
 * second rebalance never destroys the first one's undo (audit F-TRK-3-2).
 *
 * - No-op result (not rebalanced, no plan, no swaps) → the existing pending.
 * - Different plan, or the existing one is stale → the new swaps replace it.
 * - Same plan → one entry per slot (day + meal type). A slot swapped twice
 *   keeps its ORIGINAL previous recipe (undo restores what the user planned)
 *   and the latest new one; a slot swapped back to its original drops out.
 */
export function mergePendingRebalance(
  existing: PendingRebalance | null,
  result: RebalanceResultLike | null | undefined,
  now: number = Date.now(),
): PendingRebalance | null {
  if (!result?.rebalanced || !result.planId || result.swaps.length === 0) {
    return existing;
  }
  const sameLivePlan =
    existing !== null && existing.planId === result.planId && isPendingFresh(existing, now);
  const base = sameLivePlan ? existing.swaps : [];

  const slotKey = (s: RebalanceSwapLike) => `${s.dayOfWeek}:${s.mealType}`;
  const bySlot = new Map<string, RebalanceSwapLike>();
  for (const swap of base) bySlot.set(slotKey(swap), swap);
  for (const swap of result.swaps) {
    const key = slotKey(swap);
    const earlier = bySlot.get(key);
    if (!earlier) {
      bySlot.set(key, swap);
      continue;
    }
    const merged: RebalanceSwapLike = {
      ...swap,
      previousRecipeId: earlier.previousRecipeId,
      previousRecipeName: earlier.previousRecipeName,
    };
    if (merged.previousRecipeId === merged.newRecipeId) {
      bySlot.delete(key);
    } else {
      bySlot.set(key, merged);
    }
  }

  const swaps = [...bySlot.values()];
  if (swaps.length === 0) return null;
  return { planId: result.planId, swaps, createdAt: now };
}

/** Parses a stored hand-off; null when missing, malformed or stale. */
export function parsePendingRebalance(
  raw: unknown,
  now: number = Date.now(),
): PendingRebalance | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<PendingRebalance>;
  if (
    typeof value.planId !== 'string' ||
    !value.planId ||
    !Array.isArray(value.swaps) ||
    typeof value.createdAt !== 'number'
  ) {
    return null;
  }
  const pending: PendingRebalance = {
    planId: value.planId,
    swaps: value.swaps,
    createdAt: value.createdAt,
  };
  return isPendingFresh(pending, now) ? pending : null;
}
