import type { PlanSlot } from '@chefer/types';
import { choosePortions, resolvePlanDays, resolvePlanSlots, type PortionPlan } from '@chefer/utils';
import type { MealType, RecipeData } from '../../lib/ai/types.js';

// ─── Free curated week planner (audit F-PLAN-1-3, F-TRK-4-2, F-PM-4) ──────────
// The free plan used to take the next shuffled breakfast, lunch and dinner:
// days landed at 1,350–1,630 kcal against a 2,000 target (18–33% under, every
// day) and ~40% of a lifter's protein. Deterministic, zero-AI fix: each day
// picks the combination of the next few unused recipes per meal type that,
// once portioned, lands closest to the targets, and adds up to two snacks
// when three meals still fall short.
//
// P1-1 portions: every slot also gets a multiplier (0.75×–2×, quarter steps,
// @chefer/utils choosePortions) so the day lands within ±10% of the calorie
// target with protein as close to target as the dishes allow — a 3,200 kcal
// gain goal is reachable now. GAIN_MUSCLE weighs protein more and looks
// further down each queue for protein-dense dishes. When even 2× can't reach
// the protein target the day carries an honest `proteinGapG`.
//
// §2.3, T-07.2: the engine now honours the user's "how you cook" shape
// (`packages/types/src/plan-shape.ts`) — which meal types, which days, an
// optional prep+cook time cap (weekends may be exempt) and a "cooking for"
// portion. A day outside the chosen days is returned unplanned (`meals: []`,
// `planned: false`) rather than filled. A day that IS chosen but whose pool
// can't fill a slot (nothing left inside the time cap, or the pool itself is
// empty) reports it honestly via `unfilled` instead of silently serving a
// meal over the cap or skipping it with no explanation.

export interface CuratedTargets {
  calories: number;
  proteinG: number;
  goal: string | null;
  /**
   * A lifter's training weekdays (Monday = 0, audit P2-4): those days weigh
   * the protein shortfall double, so they land on the higher-protein
   * combinations (usually the dinner). Calories are not bumped — that is
   * premium.
   */
  trainingDays?: number[];
}

/**
 * The user's "how you cook" shape (T-07.1/T-07.2). Every field optional and
 * additive — an absent shape (or one built from `[]` stored slots/days, the
 * legacy sentinel) reproduces today's week: breakfast/lunch/dinner, every
 * day, no time cap, no household portion (AC7, backward-compat).
 */
export interface CuratedShapeOptions {
  slots?: readonly PlanSlot[] | undefined;
  days?: readonly number[] | undefined;
  timeCapMins?: number | null | undefined;
  weekendNoLimit?: boolean | undefined;
  /**
   * "Just me" (1, or absent) vs "Two of us" (2, free tier — ⚖ D-7): sets
   * every planned slot's portion directly (a different axis from the
   * calorie/protein-driven portion below a household scale, which is applied
   * on top via `estimatedCost.portions`, never here — see meal-portion.ts).
   */
  cookingFor?: number | null | undefined;
}

export interface PlannedMeal {
  type: MealType;
  recipe: RecipeData;
  /** Portion multiplier of one recipe serving (1 = as written). */
  portion: number;
}

/** Why a chosen day's slot could not be filled (§2.3, T-07.2). */
export interface UnfilledSlot {
  slot: MealType;
  reason: 'time' | 'pool';
}

export interface PlannedDay {
  dayOfWeek: number;
  meals: PlannedMeal[];
  /** Portioned day totals (0 for an unplanned day). */
  kcal: number;
  protein: number;
  /** Grams short of the protein target when meaningfully short, else null. */
  proteinGapG: number | null;
  /**
   * False when this day is outside the user's chosen days (T-07.2): the
   * user cooks nothing this day, so `meals` is always `[]` and totals are 0.
   * True for every day when no shape is given (legacy default: every day).
   */
  planned: boolean;
  /** Present only when a chosen day's pool couldn't fill every wanted slot. */
  unfilled?: UnfilledSlot[];
}

/** How many upcoming recipes per meal type each day may choose from. */
const CANDIDATES = 5;
/** GAIN_MUSCLE looks further down the queue for protein-dense dishes. */
const CANDIDATES_GAIN = 8;
/** At most this many snacks (high targets: a 3,200 kcal lifter). */
const MAX_SNACKS = 2;

const MAIN_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const WEEKEND_DAYS = new Set([5, 6]); // Sat, Sun (Monday = 0)

const isGain = (t: CuratedTargets) => t.goal === 'GAIN_MUSCLE';

function portionDay(recipes: RecipeData[], t: CuratedTargets, trainingDay = false): PortionPlan {
  const plan = choosePortions(
    recipes.map((r) => ({ kcal: r.nutritionInfo.calories, protein: r.nutritionInfo.protein })),
    { calories: t.calories, proteinG: t.proteinG },
    {
      // A lifter's training weekday weighs the protein shortfall double
      // (audit P2-4) — its portions lean harder toward protein-dense dishes.
      proteinWeight: (isGain(t) ? 1.5 : 1) * (trainingDay ? 2 : 1),
      // A cut shouldn't run over its calories to chase protein.
      ...(t.goal === 'LOSE_WEIGHT' && { kcalOverWeight: 1.5 }),
    },
  );
  // A lifter keeps preferring protein-dense dishes even once the target is
  // met (up to +20%); other goals then prefer calorie accuracy and 1× portions.
  if (!isGain(t) || t.proteinG <= 0 || !plan.kcalOnTarget) return plan;
  const bonus = 0.05 * Math.min(plan.protein / t.proteinG, 1.2);
  return { ...plan, score: plan.score - bonus };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Total prep+cook minutes; `0` means the recipe never stated them ("unknown" — Q-35). */
function timeMins(r: RecipeData): number {
  return (r.prepTimeMins || 0) + (r.cookTimeMins || 0);
}

/** Owner feedback Q-35: an unknown-time recipe fits any cap, but ranks after known-fast ones. */
function fitsTimeCap(r: RecipeData, capMins: number | null): boolean {
  if (capMins == null) return true;
  const t = timeMins(r);
  return t === 0 || t <= capMins;
}

/**
 * Up to `count` candidates from `pool` that fit `capMins`, known-fast ones
 * (sorted quickest first) before unknown-time ones (Q-35). No cap: `pool`
 * unchanged (existing queue order, cheapest to compute).
 */
function timeRankedCandidates(
  pool: readonly RecipeData[],
  count: number,
  capMins: number | null,
): RecipeData[] {
  if (capMins == null) return pool.slice(0, count);
  const fits = pool.filter((r) => fitsTimeCap(r, capMins));
  const known = fits.filter((r) => timeMins(r) > 0).sort((a, b) => timeMins(a) - timeMins(b));
  const unknown = fits.filter((r) => timeMins(r) === 0);
  return [...known, ...unknown].slice(0, count);
}

interface ComboResult {
  types: MealType[];
  recipes: RecipeData[];
  plan: PortionPlan;
}

/** Exhaustive search over the cartesian product of each type's candidates (≤ 8³ combos). */
function bestCombo(
  optionSets: { type: MealType; options: RecipeData[] }[],
  targets: CuratedTargets,
  trainingDay: boolean,
): ComboResult {
  const types = optionSets.map((s) => s.type);
  if (optionSets.length === 0) {
    return { types, recipes: [], plan: portionDay([], targets, trainingDay) };
  }
  let best: ComboResult | null = null;
  const combo: RecipeData[] = new Array(optionSets.length);
  const walk = (i: number): void => {
    if (i === optionSets.length) {
      const plan = portionDay(combo, targets, trainingDay);
      if (!best || plan.score < best.plan.score) {
        best = { types, recipes: combo.slice(), plan };
      }
      return;
    }
    for (const option of optionSets[i]!.options) {
      combo[i] = option;
      walk(i + 1);
    }
  };
  walk(0);
  // optionSets is non-empty and every option list inside it is non-empty
  // (callers filter empty ones out), so `best` is always set.
  return best!;
}

/**
 * Plans seven days from per-type pools. Every pool is shuffled once and used
 * as a queue: a chosen recipe moves to the back, so nothing repeats until its
 * pool runs out (the old variety rule), while each day still gets a choice.
 */
export function planCuratedWeek(
  pools: Record<MealType, RecipeData[]>,
  targets: CuratedTargets,
  random: () => number = Math.random,
  shape?: CuratedShapeOptions,
): PlannedDay[] {
  const queues = new Map<MealType, RecipeData[]>(
    (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((type) => [
      type,
      shuffle(pools[type] ?? [], random),
    ]),
  );
  // Recipes already served this cycle, per type — cleared when a pool is
  // used up, so a repeat only happens once every recipe has had its turn.
  const used = new Map<MealType, Set<string>>();
  const take = (type: MealType, recipe: RecipeData) => {
    const queue = queues.get(type)!;
    const i = queue.indexOf(recipe);
    if (i >= 0) queue.push(...queue.splice(i, 1));
    const seen = used.get(type) ?? new Set<string>();
    seen.add(recipe.id);
    used.set(type, seen);
  };
  const head = (type: MealType) => {
    const queue = queues.get(type) ?? [];
    const seen = used.get(type);
    let fresh = queue.filter((r) => !seen?.has(r.id));
    if (fresh.length === 0) {
      used.delete(type);
      fresh = queue;
    }
    return fresh;
  };

  const wantedSlots = resolvePlanSlots(shape?.slots ?? []);
  const wantedDays = resolvePlanDays(shape?.days ?? []);
  const wantedMainTypes = MAIN_TYPES.filter((t) => wantedSlots.includes(t));
  // No shape (or the legacy `[]` sentinel): today's behaviour is unchanged —
  // a snack is added opportunistically whenever the mains miss the target
  // (AC7, backward-compat), independent of an explicit "Snacks" choice. Only
  // once the user has an explicit shape does leaving Snacks off mean none.
  const isLegacyShape = !shape?.slots || shape.slots.length === 0;
  const wantsSnack = isLegacyShape || wantedSlots.includes('snack');
  // "Just me" (1, or unset) keeps the calorie/protein-driven per-eater
  // portion untouched. "Two of us" (2) cooks the recipe at double quantity
  // for the table, which is a flat multiplier, not a calorie-chasing one —
  // it overrides the chosen portion outright (§2.3, T-07.2: "cooking for 2 →
  // slot portion 2"). Larger households stay on the separate premium
  // `estimatedCost.portions` scaling (meal-portion.ts), never this field.
  const cookingForPortion = shape?.cookingFor === 2 ? 2 : null;

  const candidates = isGain(targets) ? CANDIDATES_GAIN : CANDIDATES;
  const days: PlannedDay[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    if (!wantedDays.includes(dayOfWeek)) {
      days.push({ dayOfWeek, meals: [], kcal: 0, protein: 0, proteinGapG: null, planned: false });
      continue;
    }

    const trainingDay = targets.trainingDays?.includes(dayOfWeek) ?? false;
    const capMins =
      shape?.timeCapMins != null && !(shape.weekendNoLimit && WEEKEND_DAYS.has(dayOfWeek))
        ? shape.timeCapMins
        : null;

    const unfilled: UnfilledSlot[] = [];
    const optionSets = wantedMainTypes
      .map((type) => ({ type, options: timeRankedCandidates(head(type), candidates, capMins) }))
      .filter((set) => {
        if (set.options.length > 0) return true;
        unfilled.push({ slot: set.type, reason: head(set.type).length === 0 ? 'pool' : 'time' });
        return false;
      });

    let best = bestCombo(optionSets, targets, trainingDay);
    best.recipes.forEach((recipe, i) => take(best.types[i]!, recipe));

    // Snacks only when wanted and the portioned mains still miss (calories
    // out of band or protein meaningfully short) and the snack actually helps.
    if (wantsSnack) {
      let snacksAdded = 0;
      while (
        snacksAdded < MAX_SNACKS &&
        (!best.plan.kcalOnTarget || best.plan.proteinGapG !== null)
      ) {
        const snackCandidates = timeRankedCandidates(head('snack'), candidates, capMins);
        if (snackCandidates.length === 0) {
          if (snacksAdded === 0) {
            unfilled.push({ slot: 'snack', reason: head('snack').length === 0 ? 'pool' : 'time' });
          }
          break;
        }
        let pick: { recipe: RecipeData; plan: PortionPlan } | null = null;
        for (const snack of snackCandidates) {
          const plan = portionDay([...best.recipes, snack], targets, trainingDay);
          if (!pick || plan.score < pick.plan.score) pick = { recipe: snack, plan };
        }
        if (!pick || pick.plan.score >= best.plan.score) break;
        best = {
          types: [...best.types, 'snack'],
          recipes: [...best.recipes, pick.recipe],
          plan: pick.plan,
        };
        take('snack', pick.recipe);
        snacksAdded++;
      }
    }

    const { types, recipes, plan } = best;
    days.push({
      dayOfWeek,
      planned: true,
      meals: recipes.map((recipe, i) => ({
        type: types[i] ?? 'snack',
        recipe,
        portion: cookingForPortion ?? plan.portions[i] ?? 1,
      })),
      kcal: plan.kcal,
      protein: plan.protein,
      proteinGapG: plan.proteinGapG,
      ...(unfilled.length > 0 && { unfilled }),
    });
  }
  return days;
}
