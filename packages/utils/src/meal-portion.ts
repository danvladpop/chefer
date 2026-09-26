// ─── Plan slot portions (audit P1-1: F-PLAN-1-3, F-TRK-4-2, F-PM-4) ───────────
// Free curated plans pick fixed one-serving recipes, so high targets could
// never be met: a 2,800–3,200 kcal gain goal landed ~1,000 kcal under and a
// 175 g protein target got 43–106 g. Each plan slot now carries an optional
// portion multiplier (0.75×–2× in quarter steps), chosen per day so the day
// lands within ±10% of the calorie target while protein gets as close to its
// target as the dishes allow. Deterministic, zero AI.
//
// The multiplier is the eater's share of ONE recipe serving. It is separate
// from the household portion sum (premium households cook for the table):
// the two multiply, they never replace each other.

/** Portion steps a plan slot may use. */
export const PLAN_PORTION_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** A day is "on target" for calories within ±10%. */
export const PLAN_KCAL_BAND = 0.1;

/** Protein below 90% of target (and at least this many grams short) gets a hint. */
export const PROTEIN_SHORT_BAND = 0.1;
export const MIN_PROTEIN_GAP_G = 10;

/**
 * The effective multiplier of a stored/served slot: absent, zero, negative
 * or absurd values mean the recipe as written (1×).
 */
export function slotPortion(portion: number | null | undefined): number {
  return typeof portion === 'number' && Number.isFinite(portion) && portion > 0 && portion <= 4
    ? portion
    : 1;
}

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** 0.75 → "¾×", 1.5 → "1½×", 2 → "2×". */
export function formatPortion(portion: number): string {
  const whole = Math.floor(portion);
  const frac = Math.round((portion - whole) * 100) / 100;
  const fracGlyph = FRACTIONS[String(frac)];
  if (frac === 0) return `${whole}×`;
  if (fracGlyph) return `${whole > 0 ? whole : ''}${fracGlyph}×`;
  return `${Math.round(portion * 100) / 100}×`;
}

/** Nutrition of one slot at its portion (kcal whole, macros to 0.1 g). */
export function scaleNutrition<
  T extends { calories: number; protein: number; carbs: number; fat: number },
>(n: T, portion: number): T {
  if (portion === 1) return n;
  const r1 = (v: number) => Math.round(v * portion * 10) / 10;
  return {
    ...n,
    calories: Math.round(n.calories * portion),
    protein: r1(n.protein),
    carbs: r1(n.carbs),
    fat: r1(n.fat),
    ...('fiber' in n && typeof n.fiber === 'number' && { fiber: r1(n.fiber) }),
  };
}

/**
 * Grams of protein a day is short of its target — only when it is
 * meaningfully short (under 90% and ≥ 10 g), else null. The plan shows
 * "Protein short by N g — add a snack" instead of claiming the day is on
 * target.
 */
export function proteinGapG(dayProtein: number, targetG: number | null | undefined): number | null {
  if (!targetG || targetG <= 0) return null;
  const gap = targetG - dayProtein;
  return gap >= Math.max(MIN_PROTEIN_GAP_G, targetG * PROTEIN_SHORT_BAND) ? Math.round(gap) : null;
}

/** True when the day is within the calorie band AND not protein-short. */
export function isDayOnTarget(
  day: { kcal: number; protein: number },
  targets: { calories: number; proteinG?: number | null },
): boolean {
  if (targets.calories <= 0) return false;
  const kcalOk = Math.abs(day.kcal - targets.calories) / targets.calories <= PLAN_KCAL_BAND;
  return kcalOk && proteinGapG(day.protein, targets.proteinG) === null;
}

export interface PortionMeal {
  kcal: number;
  protein: number;
}

export interface PortionTargets {
  calories: number;
  proteinG: number;
}

export interface PortionOptions {
  /** Relative weight of protein shortfall (GAIN_MUSCLE uses more). Default 1. */
  proteinWeight?: number;
  /** Allowed multipliers (default PLAN_PORTION_STEPS). */
  steps?: readonly number[];
}

export interface PortionPlan {
  /** One multiplier per input meal, same order. */
  portions: number[];
  kcal: number;
  protein: number;
  /** Day kcal within ±10% of target. */
  kcalOnTarget: boolean;
  /** See proteinGapG — null when protein is close enough. */
  proteinGapG: number | null;
  /** Lower is better; comparable across candidate days for the same targets. */
  score: number;
}

/** Above this many meals the search stops being exhaustive (6^6 ≈ 47k). */
const MAX_EXHAUSTIVE = 6;

function scorePortions(
  kcal: number,
  protein: number,
  change: number,
  t: PortionTargets,
  proteinWeight: number,
): number {
  const kcalMiss = t.calories > 0 ? Math.abs(kcal - t.calories) / t.calories : 0;
  const proteinShort = t.proteinG > 0 ? Math.max(0, t.proteinG - protein) / t.proteinG : 0;
  // Within the calorie band, protein comes first, then calorie accuracy,
  // then fewer changes to the recipes as written. Outside the band every
  // candidate ranks behind every in-band one, closest calories first.
  if (kcalMiss <= PLAN_KCAL_BAND) {
    return proteinWeight * proteinShort + 0.2 * kcalMiss + 0.01 * change;
  }
  return 10 + kcalMiss + 0.1 * proteinWeight * proteinShort + 0.01 * change;
}

/**
 * Picks a portion multiplier per meal so the day lands within ±10% of the
 * calorie target and protein gets as close to its target as possible. With
 * protein short, the search naturally upsizes the most protein-dense meals
 * (and trims the least dense ones to stay inside the calorie band). Pure and
 * deterministic: ties keep the earlier (closer to 1×) combination.
 */
export function choosePortions(
  meals: PortionMeal[],
  targets: PortionTargets,
  options: PortionOptions = {},
): PortionPlan {
  const steps = options.steps ?? PLAN_PORTION_STEPS;
  const proteinWeight = options.proteinWeight ?? 1;
  const n = meals.length;
  const sumAt = (portions: number[]) => {
    let kcal = 0;
    let protein = 0;
    meals.forEach((meal, i) => {
      const p = portions[i] ?? 1;
      kcal += meal.kcal * p;
      protein += meal.protein * p;
    });
    return { kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10 };
  };
  const finish = (portions: number[], score: number): PortionPlan => {
    const { kcal, protein } = sumAt(portions);
    return {
      portions,
      kcal,
      protein,
      kcalOnTarget:
        targets.calories > 0 &&
        Math.abs(kcal - targets.calories) / targets.calories <= PLAN_KCAL_BAND,
      proteinGapG: proteinGapG(protein, targets.proteinG),
      score,
    };
  };

  if (n === 0) return finish([], Infinity);
  if (n > MAX_EXHAUSTIVE) {
    const ones = meals.map(() => 1);
    const { kcal, protein } = sumAt(ones);
    return finish(ones, scorePortions(kcal, protein, 0, targets, proteinWeight));
  }

  // Order steps so 1× is tried first — ties then keep the recipe as written.
  const ordered = [...steps].sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1) || a - b);
  const current = new Array<number>(n).fill(1);
  let best: number[] = current.slice();
  let bestScore = Infinity;

  const walk = (i: number, kcal: number, protein: number, change: number) => {
    if (i === n) {
      const s = scorePortions(kcal, protein, change, targets, proteinWeight);
      if (s < bestScore - 1e-9) {
        bestScore = s;
        best = current.slice();
      }
      return;
    }
    const meal = meals[i];
    if (!meal) return;
    for (const p of ordered) {
      current[i] = p;
      walk(i + 1, kcal + meal.kcal * p, protein + meal.protein * p, change + Math.abs(p - 1));
    }
  };
  walk(0, 0, 0, 0);
  return finish(best, bestScore);
}
