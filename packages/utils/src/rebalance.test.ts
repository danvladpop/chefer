import { describe, expect, it } from 'vitest';
import {
  isPendingFresh,
  mergePendingRebalance,
  parsePendingRebalance,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
  type RebalanceResultLike,
  type RebalanceSwapLike,
} from './rebalance';

const NOW = 1_780_000_000_000;
const HOUR = 60 * 60 * 1000;

const swap = (over: Partial<RebalanceSwapLike> = {}): RebalanceSwapLike => ({
  dayOfWeek: 3,
  mealType: 'dinner',
  previousRecipeId: 'prev-1',
  newRecipeId: 'new-1',
  previousRecipeName: 'Herb Salmon',
  newRecipeName: 'Lentil Curry',
  ...over,
});

const pending = (
  swaps: RebalanceSwapLike[],
  createdAt = NOW,
  planId = 'plan-1',
): PendingRebalance => ({ planId, swaps, createdAt });

const result = (swaps: RebalanceSwapLike[], planId = 'plan-1'): RebalanceResultLike => ({
  rebalanced: swaps.length > 0,
  swaps,
  projectedDeviation: 0.2,
  planId,
});

describe('rebalanceBannerCopy', () => {
  it('names the adjusted slot', () => {
    expect(rebalanceBannerCopy([swap()])).toBe(
      'I adjusted Thursday dinner to keep your week on track.',
    );
  });

  it('joins several swaps with commas and "and"', () => {
    expect(
      rebalanceBannerCopy([
        swap(),
        swap({ dayOfWeek: 4, mealType: 'lunch' }),
        swap({ dayOfWeek: 6, mealType: 'breakfast' }),
      ]),
    ).toBe(
      'I adjusted Thursday dinner, Friday lunch and Sunday breakfast to keep your week on track.',
    );
  });

  it('is empty with no swaps', () => {
    expect(rebalanceBannerCopy([])).toBe('');
  });
});

describe('undoOperations', () => {
  it('restores previousRecipeId in every swapped slot', () => {
    expect(
      undoOperations(
        pending([swap(), swap({ dayOfWeek: 5, mealType: 'lunch', previousRecipeId: 'prev-2' })]),
      ),
    ).toEqual([
      { planId: 'plan-1', dayOfWeek: 3, mealType: 'dinner', recipeId: 'prev-1' },
      { planId: 'plan-1', dayOfWeek: 5, mealType: 'lunch', recipeId: 'prev-2' },
    ]);
  });
});

describe('isPendingFresh', () => {
  it('accepts a recent hand-off and rejects a day-old or empty one', () => {
    expect(isPendingFresh(pending([swap()], NOW - HOUR), NOW)).toBe(true);
    expect(isPendingFresh(pending([swap()], NOW - 25 * HOUR), NOW)).toBe(false);
    expect(isPendingFresh(pending([], NOW), NOW)).toBe(false);
  });
});

describe('mergePendingRebalance (audit F-TRK-3-2)', () => {
  it('keeps the existing hand-off when the log did not rebalance', () => {
    const existing = pending([swap()]);
    expect(mergePendingRebalance(existing, null, NOW)).toBe(existing);
    expect(mergePendingRebalance(existing, result([]), NOW)).toBe(existing);
    expect(mergePendingRebalance(existing, { ...result([swap()]), planId: undefined }, NOW)).toBe(
      existing,
    );
  });

  it('starts a hand-off from nothing', () => {
    expect(mergePendingRebalance(null, result([swap()]), NOW)).toEqual(pending([swap()]));
  });

  it('a second rebalance ADDS its swaps instead of destroying the first undo', () => {
    const first = pending([swap()], NOW - HOUR);
    const second = swap({ dayOfWeek: 5, mealType: 'lunch', previousRecipeId: 'prev-2' });
    const merged = mergePendingRebalance(first, result([second]), NOW);
    expect(merged?.swaps).toEqual([swap(), second]);
    expect(merged?.createdAt).toBe(NOW);
  });

  it('a slot swapped twice undoes to the ORIGINAL recipe', () => {
    const first = pending([swap()]);
    const again = swap({
      previousRecipeId: 'new-1',
      previousRecipeName: 'Lentil Curry',
      newRecipeId: 'new-2',
      newRecipeName: 'Tofu Bowl',
    });
    const merged = mergePendingRebalance(first, result([again]), NOW);
    expect(merged?.swaps).toEqual([swap({ newRecipeId: 'new-2', newRecipeName: 'Tofu Bowl' })]);
    expect(merged && undoOperations(merged)[0]?.recipeId).toBe('prev-1');
  });

  it('drops a slot the second rebalance put back to its original', () => {
    const first = pending([swap(), swap({ dayOfWeek: 5, mealType: 'lunch' })]);
    const back = swap({ previousRecipeId: 'new-1', newRecipeId: 'prev-1' });
    expect(mergePendingRebalance(first, result([back]), NOW)?.swaps).toEqual([
      swap({ dayOfWeek: 5, mealType: 'lunch' }),
    ]);
    expect(mergePendingRebalance(pending([swap()]), result([back]), NOW)).toBeNull();
  });

  it('replaces a hand-off for another plan or a stale one', () => {
    const next = swap({ dayOfWeek: 1 });
    expect(
      mergePendingRebalance(pending([swap()], NOW, 'old-plan'), result([next]), NOW)?.swaps,
    ).toEqual([next]);
    expect(
      mergePendingRebalance(pending([swap()], NOW - 25 * HOUR), result([next]), NOW)?.swaps,
    ).toEqual([next]);
  });
});

describe('parsePendingRebalance', () => {
  it('round-trips a fresh hand-off', () => {
    const value = pending([swap()]);
    expect(parsePendingRebalance(JSON.parse(JSON.stringify(value)), NOW)).toEqual(value);
  });

  it('rejects malformed and stale values', () => {
    expect(parsePendingRebalance(null, NOW)).toBeNull();
    expect(parsePendingRebalance('nope', NOW)).toBeNull();
    expect(parsePendingRebalance({ planId: 'p', swaps: 'x', createdAt: NOW }, NOW)).toBeNull();
    expect(parsePendingRebalance({ planId: 'p', swaps: [swap()] }, NOW)).toBeNull();
    expect(parsePendingRebalance(pending([swap()], NOW - 25 * HOUR), NOW)).toBeNull();
  });
});
