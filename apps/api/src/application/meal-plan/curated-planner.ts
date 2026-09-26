import { choosePortions, type PortionPlan } from '@chefer/utils';
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

export interface PlannedMeal {
  type: MealType;
  recipe: RecipeData;
  /** Portion multiplier of one recipe serving (1 = as written). */
  portion: number;
}

export interface PlannedDay {
  dayOfWeek: number;
  meals: PlannedMeal[];
  /** Portioned day totals. */
  kcal: number;
  protein: number;
  /** Grams short of the protein target when meaningfully short, else null. */
  proteinGapG: number | null;
}

/** How many upcoming recipes per meal type each day may choose from. */
const CANDIDATES = 5;
/** GAIN_MUSCLE looks further down the queue for protein-dense dishes. */
const CANDIDATES_GAIN = 8;
/** At most this many snacks (high targets: a 3,200 kcal lifter). */
const MAX_SNACKS = 2;

const MAIN_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

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

/**
 * Plans seven days from per-type pools. Every pool is shuffled once and used
 * as a queue: a chosen recipe moves to the back, so nothing repeats until its
 * pool runs out (the old variety rule), while each day still gets a choice.
 */
export function planCuratedWeek(
  pools: Record<MealType, RecipeData[]>,
  targets: CuratedTargets,
  random: () => number = Math.random,
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

  const candidates = isGain(targets) ? CANDIDATES_GAIN : CANDIDATES;
  const days: PlannedDay[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const trainingDay = targets.trainingDays?.includes(dayOfWeek) ?? false;
    const [breakfasts, lunches, dinners] = MAIN_TYPES.map((type) =>
      head(type).slice(0, candidates),
    ) as [RecipeData[], RecipeData[], RecipeData[]];
    let best: { recipes: RecipeData[]; plan: PortionPlan } | null = null;
    for (const b of breakfasts) {
      for (const l of lunches) {
        for (const d of dinners) {
          const plan = portionDay([b, l, d], targets, trainingDay);
          if (!best || plan.score < best.plan.score) best = { recipes: [b, l, d], plan };
        }
      }
    }
    if (!best) throw new Error('planCuratedWeek: a main meal pool is empty');

    const types: MealType[] = [...MAIN_TYPES];
    best.recipes.forEach((recipe, i) => take(MAIN_TYPES[i]!, recipe));

    // Snacks only when the portioned mains still miss (calories out of band
    // or protein meaningfully short) and the snack actually helps.
    for (
      let added = 0;
      added < MAX_SNACKS && (!best.plan.kcalOnTarget || best.plan.proteinGapG !== null);
      added++
    ) {
      let pick: { recipe: RecipeData; plan: PortionPlan } | null = null;
      for (const snack of head('snack').slice(0, candidates)) {
        const plan = portionDay([...best.recipes, snack], targets, trainingDay);
        if (!pick || plan.score < pick.plan.score) pick = { recipe: snack, plan };
      }
      if (!pick || pick.plan.score >= best.plan.score) break;
      best = { recipes: [...best.recipes, pick.recipe], plan: pick.plan };
      types.push('snack');
      take('snack', pick.recipe);
    }

    const { recipes, plan } = best;
    days.push({
      dayOfWeek,
      meals: recipes.map((recipe, i) => ({
        type: types[i] ?? 'snack',
        recipe,
        portion: plan.portions[i] ?? 1,
      })),
      kcal: plan.kcal,
      protein: plan.protein,
      proteinGapG: plan.proteinGapG,
    });
  }
  return days;
}
