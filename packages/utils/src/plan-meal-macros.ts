import { formatKcal } from './format';
import { slotPortion, sumPlanDay } from './meal-portion';
import { proteinLabel } from './numbers-mode-copy';

// FB7-11: the Plan card's meta and macro lines, and the total line of a meal
// group (FB7-04). One formatter for mobile and web.

export type PlanMealNutrition = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

export type PlanMealMacros = { kcal: number; protein: number; carbs: number; fat: number };

/** One serving's nutrition × the slot's portion, kcal and grams rounded whole. */
export function planMealMacros(
  nutrition: PlanMealNutrition,
  portion?: number | null,
): PlanMealMacros {
  const p = slotPortion(portion);
  return {
    kcal: Math.round((nutrition.calories ?? 0) * p),
    protein: Math.round((nutrition.protein ?? 0) * p),
    carbs: Math.round((nutrition.carbs ?? 0) * p),
    fat: Math.round((nutrition.fat ?? 0) * p),
  };
}

/** "P 32 g · C 60 g · F 18 g". */
export function formatMacroLine(m: Pick<PlanMealMacros, 'protein' | 'carbs' | 'fat'>): string {
  return `P ${m.protein} g · C ${m.carbs} g · F ${m.fat} g`;
}

/**
 * The card's macro line. Protein-only mode (WP-08) already shows the protein
 * in the meta line, so there is no second line: `null`.
 */
export function planMealMacroLine(
  nutrition: PlanMealNutrition,
  portion: number | null | undefined,
  proteinOnly: boolean,
): string | null {
  return proteinOnly ? null : formatMacroLine(planMealMacros(nutrition, portion));
}

/** "10 min" for the recipe's prep + cook time. */
export function formatPlanMinutes(minutes: number): string {
  return `${Math.max(0, Math.round(minutes))} min`;
}

/** The nutrition half of the meta line: "687 kcal", or "32 g protein" in protein-only mode. */
export function planMealNutritionLabel(
  nutrition: PlanMealNutrition,
  portion: number | null | undefined,
  proteinOnly: boolean,
): string {
  const m = planMealMacros(nutrition, portion);
  return proteinOnly ? proteinLabel(m.protein) : `${formatKcal(m.kcal)} kcal`;
}

/** "10 min · 687 kcal" (or "10 min · 32 g protein"). */
export function planMealMetaLine(
  minutes: number,
  nutrition: PlanMealNutrition,
  portion: number | null | undefined,
  proteinOnly: boolean,
): string {
  return `${formatPlanMinutes(minutes)} · ${planMealNutritionLabel(nutrition, portion, proteinOnly)}`;
}

/**
 * A meal group's total (main + sides): "687 kcal · P 32 g · C 60 g · F 18 g",
 * or "32 g protein" in protein-only mode. Slots count at their portion.
 */
export function mealGroupTotalLine(
  slots: readonly {
    portion?: number | null | undefined;
    recipe: { nutritionInfo: PlanMealNutrition };
  }[],
  proteinOnly: boolean,
): string {
  const t = sumPlanDay([...slots]);
  return proteinOnly
    ? proteinLabel(t.protein)
    : `${formatKcal(t.kcal)} kcal · ${formatMacroLine(t)}`;
}
