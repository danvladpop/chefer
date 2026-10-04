import { describe, expect, it } from 'vitest';
import {
  capProteinScaleFactor,
  describeProteinSnack,
  describeRebalanceSwap,
  describeWeekGap,
  isLossGoal,
  isPendingFresh,
  mergePendingRebalance,
  parsePendingRebalance,
  rebalanceBannerCopy,
  rebalanceOfferCopy,
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

  it('carries the slot index so the right snack of a two-snack day is restored', () => {
    expect(
      undoOperations(pending([swap({ mealType: 'snack', slotIndex: 4, previousRecipeId: 's2' })])),
    ).toEqual([
      { planId: 'plan-1', dayOfWeek: 3, mealType: 'snack', slotIndex: 4, recipeId: 's2' },
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

  it('keeps the two snacks of one day as separate slots', () => {
    const first = pending([swap({ mealType: 'snack', slotIndex: 3, previousRecipeId: 's1' })]);
    const second = swap({ mealType: 'snack', slotIndex: 4, previousRecipeId: 's2' });
    const merged = mergePendingRebalance(first, result([second]), NOW);
    expect(merged?.swaps.map((s) => s.previousRecipeId)).toEqual(['s1', 's2']);
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

describe('describeRebalanceSwap (B-11 one-line explanation)', () => {
  it('leads with protein for a protein swap', () => {
    const line = describeRebalanceSwap(
      swap({
        dayOfWeek: 6,
        newRecipeName: 'Chicken bowl',
        previousProteinG: 20,
        newProteinG: 48,
        previousKcal: 700,
        newKcal: 640,
        reason: 'protein',
      }),
    );
    expect(line).toBe('Sunday dinner \u2192 Chicken bowl (+28 g protein, \u221260 kcal)');
  });

  it('leads with kcal for a calorie swap and drops numbers that barely move', () => {
    const line = describeRebalanceSwap(
      swap({
        newRecipeName: 'Light soup',
        previousProteinG: 30,
        newProteinG: 32,
        previousKcal: 900,
        newKcal: 450,
        reason: 'calories',
      }),
    );
    expect(line).toBe('Thursday dinner \u2192 Light soup (\u2212450 kcal)');
  });

  it('falls back to the plain slot line without numbers (older API)', () => {
    expect(describeRebalanceSwap(swap({ newRecipeName: 'Lentil Curry' }))).toBe(
      'Thursday dinner \u2192 Lentil Curry',
    );
  });

  it('builds the offer sentence, preferring the API explanation', () => {
    const copy = rebalanceOfferCopy({
      swaps: [
        swap({ explanation: 'Sunday dinner \u2192 Chicken bowl (+28 g protein)' }),
        swap({ dayOfWeek: 5, mealType: 'lunch', newRecipeName: 'Tuna salad' }),
      ],
    });
    expect(copy).toBe(
      'I can rebalance the rest of your week: Sunday dinner \u2192 Chicken bowl (+28 g protein); Saturday lunch \u2192 Tuna salad.',
    );
    expect(rebalanceOfferCopy({ swaps: [] })).toBe('');
  });
});

describe('describeWeekGap / describeProteinSnack', () => {
  it('names the protein gap and the kcal drift', () => {
    expect(describeWeekGap({ proteinGapG: 36 })).toBe("You're 36 g short on protein this week.");
    expect(describeWeekGap({ kcalDelta: 620, proteinGapG: 36 })).toBe(
      "You're about 600 kcal over for the week and 36 g short on protein this week.",
    );
    expect(describeWeekGap({ kcalDelta: -40, proteinGapG: 3 })).toBe('');
  });

  it('describes a snack with its numbers', () => {
    expect(describeProteinSnack({ id: 'a', name: 'Greek yogurt', proteinG: 17, kcal: 150 })).toBe(
      'Greek yogurt (+17 g protein, 150 kcal)',
    );
  });
});

describe('capProteinScaleFactor (UX-PLAN-08)', () => {
  it('holds a loss-goal protein fix to +10 % kcal', () => {
    expect(capProteinScaleFactor(1.25, 'LOSE_WEIGHT')).toBe(1.1);
    expect(isLossGoal('LOSE_WEIGHT')).toBe(true);
  });

  it('leaves other goals and decreases alone', () => {
    expect(capProteinScaleFactor(1.25, 'GAIN_MUSCLE')).toBe(1.25);
    expect(capProteinScaleFactor(0.8, 'LOSE_WEIGHT')).toBe(0.8);
    expect(capProteinScaleFactor(1.25, null)).toBe(1.25);
  });

  it('returns null when nothing worth offering is left', () => {
    expect(capProteinScaleFactor(1.02, 'MAINTAIN')).toBeNull();
  });
});

describe('undo keeps working with the WP-07 detail fields', () => {
  it('merges and undoes swaps that carry numbers and an explanation', () => {
    const detailed = swap({ previousProteinG: 20, newProteinG: 48, reason: 'protein' });
    const merged = mergePendingRebalance(null, result([detailed]), NOW);
    expect(merged?.swaps[0]?.reason).toBe('protein');
    if (!merged) throw new Error('expected a pending rebalance');
    expect(undoOperations(merged)).toEqual([
      { planId: 'plan-1', dayOfWeek: 3, mealType: 'dinner', recipeId: 'prev-1' },
    ]);
  });
});
