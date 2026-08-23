import { describe, expect, it } from 'vitest';
import {
  isPendingFresh,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
  type RebalanceSwapLike,
} from './rebalance-storage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const swap = (over: Partial<RebalanceSwapLike> = {}): RebalanceSwapLike => ({
  dayOfWeek: 3,
  mealType: 'dinner',
  previousRecipeId: 'prev-1',
  newRecipeId: 'new-1',
  previousRecipeName: 'Herb Salmon',
  newRecipeName: 'Lentil Curry',
  ...over,
});

const pending = (swaps: RebalanceSwapLike[], createdAt = Date.now()): PendingRebalance => ({
  planId: 'plan-1',
  swaps,
  createdAt,
});

describe('rebalanceBannerCopy', () => {
  it('names the adjusted slot: "I adjusted Thursday dinner…"', () => {
    expect(rebalanceBannerCopy([swap()])).toBe(
      'I adjusted Thursday dinner to keep your week on track.',
    );
  });

  it('joins two swaps with "and"', () => {
    expect(rebalanceBannerCopy([swap(), swap({ dayOfWeek: 4, mealType: 'lunch' })])).toBe(
      'I adjusted Thursday dinner and Friday lunch to keep your week on track.',
    );
  });

  it('is empty with no swaps', () => {
    expect(rebalanceBannerCopy([])).toBe('');
  });
});

describe('undoOperations (F4 undo)', () => {
  it('produces one replaceRecipe call per swap, restoring previousRecipeId', () => {
    const ops = undoOperations(
      pending([swap(), swap({ dayOfWeek: 5, mealType: 'lunch', previousRecipeId: 'prev-2' })]),
    );
    expect(ops).toEqual([
      { planId: 'plan-1', dayOfWeek: 3, mealType: 'dinner', recipeId: 'prev-1' },
      { planId: 'plan-1', dayOfWeek: 5, mealType: 'lunch', recipeId: 'prev-2' },
    ]);
  });

  it('never targets the NEW recipe — undo means going back', () => {
    const ops = undoOperations(pending([swap()]));
    expect(ops[0]!.recipeId).toBe('prev-1');
    expect(ops[0]!.recipeId).not.toBe('new-1');
  });
});

describe('isPendingFresh', () => {
  it('accepts a recent hand-off and rejects a day-old one', () => {
    const now = Date.now();
    expect(isPendingFresh(pending([swap()], now - 60_000), now)).toBe(true);
    expect(isPendingFresh(pending([swap()], now - 25 * 60 * 60 * 1000), now)).toBe(false);
  });

  it('rejects a hand-off without swaps', () => {
    expect(isPendingFresh(pending([]))).toBe(false);
  });
});
