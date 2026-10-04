import type { ProteinGuide, ProteinWhy, TargetsView } from '@chefer/types';

// ─── Protein-only mode helpers (WP-08, owner decision D-5) ───────────────────────
// Pure functions shared by the API payloads and both clients. The protein
// number itself always comes from `resolveTargets` (the single resolver);
// nothing here computes a target, it only presents one.

/** Research default: grams of protein per kg of body weight (D-5). */
export const PROTEIN_REFERENCE_G_PER_KG = 1.6;
/** Effective g/kg within this of the reference is "the same" (no explanation needed). */
export const PROTEIN_REFERENCE_TOLERANCE = 0.1;
/** Per-meal range granularity and width, in grams. */
const RANGE_STEP_G = 5;
/** Meals assumed when no plan or preference says otherwise. */
export const DEFAULT_PROTEIN_MEALS = 3;

/**
 * Per-meal protein guide: target ÷ planned meals, shown as a 10 g-wide range
 * whose ends are multiples of 5 g, centred on the per-meal figure
 * (105 g ÷ 3 = 35 g → "30–40 g per meal"). The low end never drops below 5 g.
 * `meals` below 1 (no plan, rest day) falls back to 3.
 */
export function buildProteinGuide(proteinG: number, meals: number): ProteinGuide {
  const m = Number.isFinite(meals) && meals >= 1 ? Math.floor(meals) : DEFAULT_PROTEIN_MEALS;
  const target = Math.max(0, Math.round(proteinG));
  const perMeal = target / m;
  const centre = Math.round(perMeal / RANGE_STEP_G) * RANGE_STEP_G;
  const lowG = Math.max(RANGE_STEP_G, centre - RANGE_STEP_G);
  const highG = lowG + 2 * RANGE_STEP_G;
  return {
    proteinG: target,
    meals: m,
    perMealG: Math.round(perMeal * 10) / 10,
    lowG,
    highG,
    label: `${lowG}–${highG} g per meal`,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * "Why this number?" data. Names the user's effective protein target and, when
 * it is not ~1.6 g/kg, why: their own override, the training-focused goal rule,
 * or the goal's calorie split. `differs` is false when it matches the default.
 */
export function explainProteinTarget(
  view: Pick<TargetsView, 'effective' | 'source' | 'inputs'>,
): ProteinWhy {
  const effectiveG = Math.round(view.effective.proteinG);
  const weightKg =
    view.inputs.weightKg != null && view.inputs.weightKg > 0 ? view.inputs.weightKg : null;
  const hasWeight = weightKg != null;
  const gPerKg = weightKg != null ? round1(effectiveG / weightKg) : null;
  const referenceG = weightKg != null ? Math.round(PROTEIN_REFERENCE_G_PER_KG * weightKg) : null;
  const differs =
    weightKg == null
      ? false
      : Math.abs(effectiveG / weightKg - PROTEIN_REFERENCE_G_PER_KG) > PROTEIN_REFERENCE_TOLERANCE;

  const base = {
    effectiveG,
    gPerKg,
    referenceGPerKg: PROTEIN_REFERENCE_G_PER_KG,
    referenceG,
    differs,
  };

  if (!hasWeight) {
    return {
      ...base,
      reason: 'NO_WEIGHT',
      sentence: `Your protein target is ${effectiveG} g a day. Add your weight and we will show how it compares with the usual 1.6 g per kg.`,
    };
  }
  if (!differs) {
    const reason =
      view.source === 'own'
        ? 'OWN'
        : view.inputs.proteinGPerKg != null
          ? 'LIFTER_GOAL'
          : 'GOAL_SPLIT';
    return {
      ...base,
      reason,
      sentence: `Your protein target is ${effectiveG} g a day, about 1.6 g per kg of your body weight.`,
    };
  }
  if (view.source === 'own') {
    return {
      ...base,
      reason: 'OWN',
      sentence: `You set your own protein target: ${effectiveG} g a day, about ${gPerKg} g per kg. The usual starting point is 1.6 g per kg (${referenceG} g for you).`,
    };
  }
  if (view.inputs.proteinGPerKg != null) {
    return {
      ...base,
      reason: 'LIFTER_GOAL',
      sentence: `Your protein target is ${effectiveG} g a day, ${view.inputs.proteinGPerKg} g per kg, because your goal and training call for more than the usual 1.6 g per kg (${referenceG} g for you).`,
    };
  }
  return {
    ...base,
    reason: 'GOAL_SPLIT',
    sentence: `Your protein target is ${effectiveG} g a day, about ${gPerKg} g per kg. It comes from how your goal splits your calories, not from the usual 1.6 g per kg (${referenceG} g for you).`,
  };
}
