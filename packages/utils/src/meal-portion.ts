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

/**
 * A plan day's totals with each slot at its portion (kcal and grams rounded
 * whole) — the one sum web and mobile show. Missing macros count as 0.
 */
export function sumPlanDay(
  meals: {
    portion?: number | null | undefined;
    recipe: {
      nutritionInfo: { calories?: number; protein?: number; carbs?: number; fat?: number };
    };
  }[],
): { kcal: number; protein: number; carbs: number; fat: number } {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const m of meals) {
    const p = slotPortion(m.portion);
    const n = m.recipe.nutritionInfo;
    kcal += (n.calories ?? 0) * p;
    protein += (n.protein ?? 0) * p;
    carbs += (n.carbs ?? 0) * p;
    fat += (n.fat ?? 0) * p;
  }
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
  };
}

export interface PortionMeal {
  kcal: number;
  protein: number;
  /**
   * Hold this meal at exactly this portion (day rebalance: the user's pick,
   * a pinned slot, something already eaten). It still counts in the day.
   */
  fixedPortion?: number;
  /** The portion "no change" means for this meal (default 1×, as written). */
  fromPortion?: number;
}

export interface PortionTargets {
  calories: number;
  proteinG: number;
}

export interface PortionOptions {
  /** Relative weight of protein shortfall (GAIN_MUSCLE uses more). Default 1. */
  proteinWeight?: number;
  /**
   * Cost of a 1% calorie miss inside the band, relative to 1% protein short
   * (default 1: a day won't run 10% over its calories for 5% more protein).
   */
  kcalWeight?: number;
  /** Same, for calories ABOVE target (default kcalWeight; a cut uses more). */
  kcalOverWeight?: number;
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

interface Weights {
  protein: number;
  kcalUnder: number;
  kcalOver: number;
}

function scorePortions(
  kcal: number,
  protein: number,
  change: number,
  t: PortionTargets,
  w: Weights,
): number {
  const kcalMiss = t.calories > 0 ? Math.abs(kcal - t.calories) / t.calories : 0;
  const proteinShort = t.proteinG > 0 ? Math.max(0, t.proteinG - protein) / t.proteinG : 0;
  // Within the calorie band, protein shortfall trades against calorie
  // accuracy, then fewer changes to the recipes as written. Outside the band
  // every candidate ranks behind every in-band one, closest calories first.
  if (kcalMiss <= PLAN_KCAL_BAND) {
    const kcalWeight = kcal > t.calories ? w.kcalOver : w.kcalUnder;
    return w.protein * proteinShort + kcalWeight * kcalMiss + 0.01 * change;
  }
  return 10 + kcalMiss + 0.1 * w.protein * proteinShort + 0.01 * change;
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
  const kcalUnder = options.kcalWeight ?? 1;
  const weights: Weights = {
    protein: options.proteinWeight ?? 1,
    kcalUnder,
    kcalOver: options.kcalOverWeight ?? kcalUnder,
  };
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
  const free = meals.filter((m) => m.fixedPortion === undefined).length;
  if (free > MAX_EXHAUSTIVE) {
    const ones = meals.map((m) => m.fixedPortion ?? m.fromPortion ?? 1);
    const { kcal, protein } = sumAt(ones);
    return finish(ones, scorePortions(kcal, protein, 0, targets, weights));
  }

  // Order steps so 1× is tried first — ties then keep the recipe as written.
  const ordered = [...steps].sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1) || a - b);
  const current = meals.map((m) => m.fixedPortion ?? m.fromPortion ?? 1);
  let best: number[] = current.slice();
  let bestScore = Infinity;

  const walk = (i: number, kcal: number, protein: number, change: number) => {
    if (i === n) {
      const s = scorePortions(kcal, protein, change, targets, weights);
      if (s < bestScore - 1e-9) {
        bestScore = s;
        best = current.slice();
      }
      return;
    }
    const meal = meals[i];
    if (!meal) return;
    if (meal.fixedPortion !== undefined) {
      current[i] = meal.fixedPortion;
      walk(
        i + 1,
        kcal + meal.kcal * meal.fixedPortion,
        protein + meal.protein * meal.fixedPortion,
        change,
      );
      return;
    }
    const from = meal.fromPortion ?? 1;
    // Steps nearest the meal's current portion first: ties keep it as it is.
    const stepsHere =
      from === 1
        ? ordered
        : [...steps].sort((a, b) => Math.abs(a - from) - Math.abs(b - from) || a - b);
    for (const p of stepsHere) {
      current[i] = p;
      walk(i + 1, kcal + meal.kcal * p, protein + meal.protein * p, change + Math.abs(p - from));
    }
  };
  walk(0, 0, 0, 0);
  return finish(best, bestScore);
}

// ─── Day rebalance (2026-10-16) ───────────────────────────────────────────────
// After a swap, a replace or a log, the day's OTHER open meals are resized
// (same ¾×–2× steps) so the day lands back on its target. Open = still
// planned: not eaten, not replaced or skipped, not the user's pick. With no
// open meal left the day is left as it is — the user chose, and one day a
// little over or under is not worth rearranging the rest of the week for.

/** A day this close to its calorie target (and not protein-short) is not resized. */
export const DAY_FIT_CLOSE_ENOUGH = 0.03;
/** A resize must cut the day's miss by at least this much (calorie fraction + protein fraction). */
export const DAY_FIT_MIN_GAIN = 0.02;

function dayFitMiss(d: { kcal: number; protein: number }, t: PortionTargets): number {
  const kcalMiss = t.calories > 0 ? Math.abs(d.kcal - t.calories) / t.calories : 0;
  const proteinShort = t.proteinG > 0 ? Math.max(0, t.proteinG - d.protein) / t.proteinG : 0;
  return kcalMiss + proteinShort;
}

export interface DayFitSlot {
  /** Per-serving numbers of the slot's recipe (or of what replaced it). */
  kcal: number;
  protein: number;
  /** The slot's current portion. */
  portion: number;
  /** True when the slot must keep its portion (eaten, replaced, the user's pick, pinned). */
  locked: boolean;
  /** False when the slot no longer counts toward the day (skipped). Default true. */
  counts?: boolean;
}

export interface DayFitResult {
  /** One portion per input slot (locked and non-counting slots unchanged). */
  portions: number[];
  /** Indexes whose portion changed. */
  changed: number[];
  /** The day before and after, at the portions. */
  before: { kcal: number; protein: number };
  after: { kcal: number; protein: number };
  /** The day (after) is within ±10% of calories and not protein-short. */
  onTarget: boolean;
  /** No open slot was left to resize. */
  nothingOpen: boolean;
}

/**
 * Resizes a day's open slots so the day lands on `targets`. Leaves the day
 * untouched when it is already on target (no churn) or when nothing is open.
 * `extra` is eaten food not tied to a slot (an extra snack logged today).
 */
export function fitDayPortions(
  slots: readonly DayFitSlot[],
  targets: PortionTargets,
  options: PortionOptions & { extra?: { kcal: number; protein: number } } = {},
): DayFitResult {
  const extra = options.extra ?? { kcal: 0, protein: 0 };
  const total = (portions: readonly number[]) => {
    let kcal = extra.kcal;
    let protein = extra.protein;
    slots.forEach((slot, i) => {
      if (slot.counts === false) return;
      const p = portions[i] ?? slot.portion;
      kcal += slot.kcal * p;
      protein += slot.protein * p;
    });
    return { kcal: Math.round(kcal), protein: Math.round(protein) };
  };
  const current = slots.map((slot) => slotPortion(slot.portion));
  const before = total(current);
  const open = slots.map((slot) => !slot.locked && slot.counts !== false);
  const nothingOpen = !open.some(Boolean);
  const unchanged = (): DayFitResult => ({
    portions: current,
    changed: [],
    before,
    after: before,
    onTarget: isDayOnTarget(before, { calories: targets.calories, proteinG: targets.proteinG }),
    nothingOpen,
  });
  // "On target" for the UI is the ±10% band, but a resize aims closer: a day
  // already within DAY_FIT_CLOSE_ENOUGH (and not protein-short) is left alone,
  // anything else is resized when that improves it by at least
  // DAY_FIT_MIN_GAIN — so the plan lands ON the target, not just near it
  // (owner, 2026-10-16: a 3,012 kcal training day against 3,309 is "short").
  const closeEnough =
    targets.calories > 0 &&
    Math.abs(before.kcal - targets.calories) / targets.calories <= DAY_FIT_CLOSE_ENOUGH &&
    proteinGapG(before.protein, targets.proteinG) === null;
  if (nothingOpen || closeEnough) return unchanged();
  // The extra food rides along as one more fixed "meal" at 1×.
  const meals: PortionMeal[] = [
    ...slots.map(
      (slot, i): PortionMeal =>
        slot.counts === false
          ? { kcal: 0, protein: 0, fixedPortion: 1 }
          : open[i]
            ? { kcal: slot.kcal, protein: slot.protein, fromPortion: current[i] ?? 1 }
            : { kcal: slot.kcal, protein: slot.protein, fixedPortion: current[i] ?? 1 },
    ),
    { kcal: extra.kcal, protein: extra.protein, fixedPortion: 1 },
  ];
  const plan = choosePortions(meals, targets, options);
  const portions = slots.map((_, i) =>
    open[i] ? (plan.portions[i] ?? current[i] ?? 1) : (current[i] ?? 1),
  );
  const changed = portions.flatMap((p, i) => (p !== current[i] ? [i] : []));
  const after = total(portions);
  if (dayFitMiss(after, targets) > dayFitMiss(before, targets) - DAY_FIT_MIN_GAIN)
    return unchanged();
  return {
    portions,
    changed,
    before,
    after,
    onTarget: isDayOnTarget(after, { calories: targets.calories, proteinG: targets.proteinG }),
    nothingOpen,
  };
}
