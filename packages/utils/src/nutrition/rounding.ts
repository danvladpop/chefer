import type { NutritionFacts } from '@chefer/types';

// ─── Rounding (plan-ingredient-catalog §5.4) ──────────────────────────────────
// Sum at full precision; round only the per-serving figures: kcal to an
// integer, protein/carbs/fat/fiber to one decimal. Stored `nutritionInfo` is
// exactly this output (I1).

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // EPSILON nudges binary-float halves (1.05 stored as 1.0499…) to round up.
  const r = Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
  return r === 0 ? 0 : r; // never -0
}

export function roundNutritionFacts(facts: NutritionFacts): NutritionFacts {
  return {
    calories: roundTo(facts.calories, 0),
    protein: roundTo(facts.protein, 1),
    carbs: roundTo(facts.carbs, 1),
    fat: roundTo(facts.fat, 1),
    fiber: roundTo(facts.fiber, 1),
  };
}
