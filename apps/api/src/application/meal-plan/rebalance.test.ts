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

// ─── WP-07: protein-aware selection ───────────────────────────────────────────
// Weekly protein target 840 g (120/day). Wednesday today; Thu–Sun are open.

const pslot = (
  dayOfWeek: number,
  mealType: string,
  recipeId: string,
  kcal: number,
  proteinG: number,
): RebalanceSlot => ({ ...slot(dayOfWeek, mealType, recipeId, kcal), proteinG });

const pcand = (id: string, kcal: number, proteinG: number): RebalanceCandidate => ({
  ...cand(id, kcal),
  proteinG,
});

/** A week on its kcal target but `gapG` short on protein. */
const proteinInput = (
  gapG: number,
  over: Partial<RebalanceSelectionInput> = {},
): RebalanceSelectionInput => {
  const futureSlots = [
    pslot(3, 'dinner', 'thu-dinner', 700, 25),
    pslot(4, 'dinner', 'fri-dinner', 700, 25),
    pslot(5, 'lunch', 'sat-lunch', 600, 20),
  ];
  const futureProtein = 25 + 25 + 20;
  return {
    todayIndex: 2,
    weeklyTargetKcal: 14_000,
    consumedKcal: 14_000 - 2_000, // projected = 14 000 exactly
    futureSlots,
    candidatesByType: {},
    weeklyTargetProteinG: 840,
    consumedProteinG: 840 - gapG - futureProtein,
    proteinTrigger: true,
    ...over,
  };
};

describe('selectRebalanceSwaps — protein (WP-07)', () => {
  it('a −36 g week on a loss goal gets a higher-protein swap, not more food', () => {
    const result = selectRebalanceSwaps(
      proteinInput(36, {
        goal: 'LOSE_WEIGHT',
        candidatesByType: {
          dinner: [pcand('chicken-bowl', 740, 55), pcand('huge-steak', 1300, 70)],
        },
      }),
    );
    expect(result.proteinGapG).toBe(36);
    expect(result.swaps).toHaveLength(1);
    const [swap] = result.swaps;
    expect(swap).toMatchObject({ newRecipeId: 'chicken-bowl', reason: 'protein' });
    expect(swap!.newProteinG! - swap!.previousProteinG!).toBe(30);
    expect(swap!.explanation).toBe(
      'Thursday dinner → chicken-bowl (+30 g protein)'.replace('chicken-bowl', 'name-chicken-bowl'),
    );
    // kcal grew by 40 (≪ 10 % of a 2 000 kcal day); the gap is nearly closed.
    expect(result.projectedKcalAfter - result.projectedKcal).toBe(40);
    expect(result.proteinGapAfterG).toBeLessThan(10);
  });

  it('on a loss goal never spends more than 10 % of a day (200 kcal) on protein', () => {
    const input = proteinInput(36, {
      goal: 'LOSE_WEIGHT',
      candidatesByType: { dinner: [pcand('bigger-portions', 1200, 60)] },
    });
    // +500 kcal for +35 g protein: exactly the UX-PLAN-08 "Bigger portions" trap.
    expect(selectRebalanceSwaps(input).swaps).toHaveLength(0);
    // The same candidate is fine on a muscle-gain goal.
    const gain = selectRebalanceSwaps({ ...input, goal: 'GAIN_MUSCLE' });
    expect(gain.swaps.map((s) => s.newRecipeId)).toEqual(['bigger-portions']);
  });

  it('keeps the protein fixes of a loss week inside one 10 % budget together', () => {
    const result = selectRebalanceSwaps(
      proteinInput(60, {
        goal: 'LOSE_WEIGHT',
        candidatesByType: { dinner: [pcand('d-a', 880, 50), pcand('d-b', 880, 50)] },
      }),
    );
    // each swap adds 180 kcal (< 200) but two would add 360 (> 200): only one.
    expect(result.swaps).toHaveLength(1);
  });

  it('a protein swap never pushes the week outside the kcal tolerance', () => {
    // Already +14 % over: a +300 kcal protein swap would land at +16 %.
    const input = proteinInput(36, {
      consumedKcal: 12_000 + 1_960,
      candidatesByType: { dinner: [pcand('rich', 1000, 60)] },
    });
    expect(selectRebalanceSwaps(input).swaps).toHaveLength(0);
  });

  it('prefers the higher-protein swap among equally good calorie swaps', () => {
    const swaps = selectRebalanceSwaps({
      todayIndex: 2,
      weeklyTargetKcal: 14_000,
      consumedKcal: 16_000,
      futureSlots: [pslot(3, 'dinner', 'thu-dinner', 800, 20)],
      candidatesByType: {
        dinner: [pcand('light-low-protein', 350, 10), pcand('light-high-protein', 360, 45)],
      },
      weeklyTargetProteinG: 840,
      consumedProteinG: 600,
      maxSwaps: 1,
    }).swaps;
    expect(swaps[0]).toMatchObject({ newRecipeId: 'light-high-protein', reason: 'both' });
  });

  it('only RANKS by protein on the auto path: a protein gap alone triggers nothing', () => {
    const input = proteinInput(36, {
      proteinTrigger: false,
      candidatesByType: { dinner: [pcand('chicken-bowl', 740, 55)] },
    });
    expect(selectRebalanceSwaps(input).swaps).toHaveLength(0);
    expect(selectRebalanceSwaps({ ...input, proteinTrigger: true }).swaps).toHaveLength(1);
  });

  it('ignores a small gap (< 30 g) and a week with no protein target', () => {
    const candidatesByType = { dinner: [pcand('chicken-bowl', 740, 55)] };
    expect(selectRebalanceSwaps(proteinInput(20, { candidatesByType })).swaps).toHaveLength(0);
    expect(
      selectRebalanceSwaps(proteinInput(60, { candidatesByType, weeklyTargetProteinG: 0 })).swaps,
    ).toHaveLength(0);
  });

  it('counts today’s remaining slots and never swaps a locked ("Your pick") slot', () => {
    const base = proteinInput(36, {
      candidatesByType: { dinner: [pcand('chicken-bowl', 740, 55)] },
    });
    // Today still has a 600 kcal / 30 g meal to eat: the projection grows by it.
    const withToday = selectRebalanceSwaps({
      ...base,
      todayRemaining: { kcal: 600, proteinG: 30 },
    });
    expect(withToday.projectedKcal).toBe(selectRebalanceSwaps(base).projectedKcal + 600);
    expect(withToday.proteinGapG).toBe(6); // 30 g of the 36 g gap is already coming today
    // Every dinner locked → nothing to swap.
    const locked = selectRebalanceSwaps({
      ...base,
      futureSlots: base.futureSlots.map((s) => ({ ...s, locked: true })),
    });
    expect(locked.swaps).toHaveLength(0);
  });

  it('is convergent: once the swap is in place a re-run is a no-op', () => {
    const input = proteinInput(36, {
      candidatesByType: { dinner: [pcand('chicken-bowl', 740, 55)] },
    });
    const first = selectRebalanceSwaps(input);
    expect(first.swaps).toHaveLength(1);
    const applied: RebalanceSelectionInput = {
      ...input,
      futureSlots: input.futureSlots.map((s) =>
        s.dayOfWeek === 3 && s.mealType === 'dinner'
          ? { ...s, recipeId: 'chicken-bowl', kcal: 740, proteinG: 55 }
          : s,
      ),
    };
    expect(selectRebalanceSwaps(applied).swaps).toHaveLength(0);
  });
});
