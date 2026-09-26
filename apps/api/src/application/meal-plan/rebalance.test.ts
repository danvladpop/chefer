import { describe, expect, it } from 'vitest';
import {
  selectRebalanceSwaps,
  type RebalanceCandidate,
  type RebalanceSelectionInput,
  type RebalanceSlot,
} from './rebalance.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// Weekly target 14 000 kcal (2 000/day). Today is Wednesday (index 2), so
// Thursday–Sunday (3–6) are the only touchable days.

const slot = (
  dayOfWeek: number,
  mealType: string,
  recipeId: string,
  kcal: number,
): RebalanceSlot => ({ dayOfWeek, mealType, recipeId, recipeName: `name-${recipeId}`, kcal });

const cand = (id: string, kcal: number): RebalanceCandidate => ({ id, name: `name-${id}`, kcal });

const candidatesByType: Record<string, RebalanceCandidate[]> = {
  dinner: [cand('dinner-light', 350), cand('dinner-mid', 700), cand('dinner-heavy', 1100)],
  lunch: [cand('lunch-light', 300), cand('lunch-mid', 600)],
};

const baseInput = (over: Partial<RebalanceSelectionInput> = {}): RebalanceSelectionInput => ({
  todayIndex: 2,
  weeklyTargetKcal: 14_000,
  // Mon+Tue+Wed logged normally.
  consumedKcal: 6_000,
  futureSlots: [
    slot(3, 'lunch', 'thu-lunch', 600),
    slot(3, 'dinner', 'thu-dinner', 800),
    slot(4, 'dinner', 'fri-dinner', 800),
    slot(5, 'dinner', 'sat-dinner', 800),
  ],
  candidatesByType,
  ...over,
});

describe('selectRebalanceSwaps', () => {
  it('no-ops when the projection is within ±15% of the weekly target', () => {
    // 6000 consumed + 3000 planned = 9000 … way under, BUT with a tight week
    // fixture: consumed 10 000 + 3 000 planned = 13 000 → −7.1% → on track.
    const result = selectRebalanceSwaps(baseInput({ consumedKcal: 10_000 }));
    expect(result.swaps).toHaveLength(0);
    expect(Math.abs(result.projectedDeviation)).toBeLessThanOrEqual(0.15);
  });

  it('swaps future dinners down after an overshoot, capped at two swaps', () => {
    // Big overshoot: 14 500 consumed by Wednesday + 3 000 planned = 17 500
    // (+25%). Two dinner downgrades (800 → 350) recover 900 kcal.
    const result = selectRebalanceSwaps(baseInput({ consumedKcal: 14_500 }));
    expect(result.projectedDeviation).toBeGreaterThan(0.15);
    expect(result.swaps.length).toBeLessThanOrEqual(2);
    expect(result.swaps.length).toBeGreaterThan(0);
    for (const swap of result.swaps) {
      const original = baseInput().futureSlots.find(
        (s) => s.dayOfWeek === swap.dayOfWeek && s.mealType === swap.mealType,
      )!;
      const replacement = candidatesByType[swap.mealType]!.find((c) => c.id === swap.newRecipeId)!;
      expect(replacement.kcal).toBeLessThan(original.kcal); // moved toward target
      expect(swap.previousRecipeId).toBe(original.recipeId);
    }
    expect(Math.abs(result.projectedDeviationAfter)).toBeLessThan(
      Math.abs(result.projectedDeviation),
    );
  });

  it('never touches today or past days, even when passed to it', () => {
    const result = selectRebalanceSwaps(
      baseInput({
        consumedKcal: 14_500,
        futureSlots: [
          slot(0, 'dinner', 'mon-dinner', 900), // past
          slot(2, 'dinner', 'wed-dinner', 900), // today
          slot(3, 'dinner', 'thu-dinner', 800),
        ],
      }),
    );
    for (const swap of result.swaps) {
      expect(swap.dayOfWeek).toBeGreaterThan(2);
    }
  });

  it('swaps upward when the week projects too LOW', () => {
    // Barely eaten all week: 2 000 by Wednesday + 3 000 planned = 5 000 (−64%).
    const result = selectRebalanceSwaps(baseInput({ consumedKcal: 2_000 }));
    expect(result.projectedDeviation).toBeLessThan(-0.15);
    expect(result.swaps.length).toBeGreaterThan(0);
    for (const swap of result.swaps) {
      const original = baseInput().futureSlots.find(
        (s) => s.dayOfWeek === swap.dayOfWeek && s.mealType === swap.mealType,
      )!;
      const replacement = candidatesByType[swap.mealType]!.find((c) => c.id === swap.newRecipeId)!;
      expect(replacement.kcal).toBeGreaterThan(original.kcal);
    }
  });

  it('stops after the first swap once the projection is back within tolerance', () => {
    // Mild overshoot: 12 700 + 3 000 = 15 700 (+12.1%)? No — needs > 15%.
    // 13 200 + 3 000 = 16 200 (+15.7%). One dinner 800→350 lands 15 750…
    // still 12.5% over BUT within threshold → exactly one swap.
    const result = selectRebalanceSwaps(baseInput({ consumedKcal: 13_200 }));
    expect(result.swaps).toHaveLength(1);
    expect(Math.abs(result.projectedDeviationAfter)).toBeLessThanOrEqual(0.15);
  });

  it('is convergent: re-running after the swaps were applied is a no-op', () => {
    const first = selectRebalanceSwaps(baseInput({ consumedKcal: 13_200 }));
    expect(first.swaps).toHaveLength(1);
    // Apply the swap to the fixture and re-run — the week is now on track.
    const applied = baseInput({ consumedKcal: 13_200 });
    for (const swap of first.swaps) {
      const target = applied.futureSlots.find(
        (s) => s.dayOfWeek === swap.dayOfWeek && s.mealType === swap.mealType,
      )!;
      const replacement = candidatesByType[swap.mealType]!.find((c) => c.id === swap.newRecipeId)!;
      target.recipeId = replacement.id;
      target.kcal = replacement.kcal;
    }
    const second = selectRebalanceSwaps(applied);
    expect(second.swaps).toHaveLength(0);
  });

  it('skips swaps that would not improve meaningfully', () => {
    // Overshoot but the only candidates match the planned calories exactly.
    const result = selectRebalanceSwaps(
      baseInput({
        consumedKcal: 14_500,
        candidatesByType: { dinner: [cand('same-kcal', 800)], lunch: [cand('same-lunch', 600)] },
      }),
    );
    expect(result.swaps).toHaveLength(0);
    expect(result.projectedDeviation).toBeGreaterThan(0.15);
  });

  it('no-ops with no future slots (Sunday log)', () => {
    const result = selectRebalanceSwaps(
      baseInput({ todayIndex: 6, futureSlots: [], consumedKcal: 20_000 }),
    );
    expect(result.swaps).toHaveLength(0);
  });

  it('never reuses the same candidate for two slots', () => {
    const result = selectRebalanceSwaps(
      baseInput({
        consumedKcal: 16_000,
        candidatesByType: { dinner: [cand('only-light', 200)], lunch: [] },
      }),
    );
    const newIds = result.swaps.map((s) => s.newRecipeId);
    expect(new Set(newIds).size).toBe(newIds.length);
    expect(result.swaps.length).toBeLessThanOrEqual(1); // one candidate → one swap
  });
});

describe('selectRebalanceSwaps — two-snack days', () => {
  it('reports which snack it swapped by slot index', () => {
    const snackSlot = (slotIndex: number, recipeId: string): RebalanceSlot => ({
      ...slot(4, 'snack', recipeId, 900),
      slotIndex,
    });
    const result = selectRebalanceSwaps(
      baseInput({
        // 16 000 + 1 800 = +27%: both snacks must go lighter.
        consumedKcal: 16_000,
        futureSlots: [snackSlot(3, 'fri-snack-1'), snackSlot(4, 'fri-snack-2')],
        candidatesByType: { snack: [cand('snack-light', 100), cand('snack-lighter', 80)] },
      }),
    );
    expect(result.swaps.map((s) => [s.previousRecipeId, s.slotIndex])).toEqual([
      ['fri-snack-1', 3],
      ['fri-snack-2', 4],
    ]);
  });
});
