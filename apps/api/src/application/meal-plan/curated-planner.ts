import type { MealType, RecipeData } from '../../lib/ai/types.js';

// ─── Free curated week planner (audit F-PLAN-1-3, F-TRK-4-2, F-PM-4) ──────────
// The free plan used to take the next shuffled breakfast, lunch and dinner:
// days landed at 1,350–1,630 kcal against a 2,000 target (18–33% under, every
// day) and ~40% of a lifter's protein. Deterministic, zero-AI fix: each day
// picks the combination of the next few unused recipes per meal type that
// lands closest to the calorie target (protein counts too, double for
// GAIN_MUSCLE), and adds up to two snacks when three meals still fall short.
// Targets above what the pool can reach (≈2,300 kcal) still land under —
// portion scaling is the follow-up (needs slot portions in both clients).

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

export interface PlannedDay {
  dayOfWeek: number;
  meals: { type: MealType; recipe: RecipeData }[];
}

/** How many upcoming recipes per meal type each day may choose from. */
const CANDIDATES = 5;
/** Add a snack while the day lands below this share of the target… */
const SNACK_BELOW = 0.9;
/** …up to this many (high targets: a 2,700 kcal lifter). */
const MAX_SNACKS = 2;

const MAIN_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

function score(kcal: number, protein: number, t: CuratedTargets, trainingDay = false): number {
  const kcalMiss = Math.abs(kcal - t.calories) / t.calories;
  const proteinShort = t.proteinG > 0 ? Math.max(0, t.proteinG - protein) / t.proteinG : 0;
  const proteinWeight = (t.goal === 'GAIN_MUSCLE' ? 1 : 0.5) * (trainingDay ? 2 : 1);
  return kcalMiss + proteinWeight * proteinShort;
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
    return fresh.slice(0, CANDIDATES);
  };

  const days: PlannedDay[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const trainingDay = targets.trainingDays?.includes(dayOfWeek) ?? false;
    const [breakfasts, lunches, dinners] = MAIN_TYPES.map(head) as [
      RecipeData[],
      RecipeData[],
      RecipeData[],
    ];
    let best: { meals: RecipeData[]; score: number; kcal: number; protein: number } | null = null;
    for (const b of breakfasts) {
      for (const l of lunches) {
        for (const d of dinners) {
          const kcal =
            b.nutritionInfo.calories + l.nutritionInfo.calories + d.nutritionInfo.calories;
          const protein =
            b.nutritionInfo.protein + l.nutritionInfo.protein + d.nutritionInfo.protein;
          const s = score(kcal, protein, targets, trainingDay);
          if (!best || s < best.score) best = { meals: [b, l, d], score: s, kcal, protein };
        }
      }
    }
    if (!best) throw new Error('planCuratedWeek: a main meal pool is empty');

    const meals: PlannedDay['meals'] = best.meals.map((recipe, i) => ({
      type: MAIN_TYPES[i]!,
      recipe,
    }));
    best.meals.forEach((recipe, i) => take(MAIN_TYPES[i]!, recipe));

    let kcal = best.kcal;
    let protein = best.protein;
    let current = best.score;
    for (let added = 0; added < MAX_SNACKS && kcal < targets.calories * SNACK_BELOW; added++) {
      const snack = head('snack').reduce<{ recipe: RecipeData; score: number } | null>(
        (acc, recipe) => {
          const s = score(
            kcal + recipe.nutritionInfo.calories,
            protein + recipe.nutritionInfo.protein,
            targets,
            trainingDay,
          );
          return !acc || s < acc.score ? { recipe, score: s } : acc;
        },
        null,
      );
      if (!snack || snack.score >= current) break;
      meals.push({ type: 'snack', recipe: snack.recipe });
      take('snack', snack.recipe);
      kcal += snack.recipe.nutritionInfo.calories;
      protein += snack.recipe.nutritionInfo.protein;
      current = snack.score;
    }
    days.push({ dayOfWeek, meals });
  }
  return days;
}
