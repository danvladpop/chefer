// ─── Week rebalance (F4 Snap-to-Log) ─────────────────────────────────────────
// Wave-0 seam module (premium_plan.md §3.3): declared here so feat/snap owns
// the whole implementation without ever touching meal-plan.service.ts.
//
// Contract: after any meal log, if week-to-date consumed + still-planned
// calories project more than ±15% off the weekly target, swap up to two
// FUTURE meals for closer-calorie alternatives. Never touches today or past
// days. Each swap records the pair it made so the banner's undo can restore
// the previous recipe.

export interface RebalanceSwap {
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  mealType: string;
  previousRecipeId: string;
  newRecipeId: string;
}

export interface RebalanceResult {
  /** Whether any swap was applied. */
  rebalanced: boolean;
  /** The swaps made (empty when rebalanced is false) — kept for undo. */
  swaps: RebalanceSwap[];
  /** Projected weekly kcal deviation (fraction, e.g. 0.18 = 18% over). */
  projectedDeviation: number;
}

/**
 * Stub until feat/snap lands (wave 1). Callers may wire it up already — a
 * no-op result is a valid "week is on track" answer.
 */
export async function rebalanceWeek(_userId: string, _planId: string): Promise<RebalanceResult> {
  return { rebalanced: false, swaps: [], projectedDeviation: 0 };
}
