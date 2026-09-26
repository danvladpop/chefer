import { describe, expect, it } from 'vitest';
import type { MealType, RecipeData } from '../../lib/ai/types.js';
import { CURATED_POOL_BY_TYPE } from '../../lib/curated-recipes/index.js';
import { planCuratedWeek, type CuratedTargets } from './curated-planner.js';

// ─── Before/after comparison on the real curated pool (audit P1-1) ────────────
// Tests-only. "Before" is the PR #22 planner (kcal-picked recipes + up to two
// snacks, every slot at 1×), reproduced here verbatim in spirit; "after" is
// the shipped planner with per-slot portions. Run with
//   pnpm --filter @chefer/api exec vitest run curated-planner.comparison
// to print the per-persona table.

function beforePlanner(
  pools: Record<MealType, RecipeData[]>,
  t: CuratedTargets,
  random: () => number,
): { kcal: number; protein: number }[] {
  const shuffle = (items: RecipeData[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  const score = (kcal: number, protein: number) =>
    Math.abs(kcal - t.calories) / t.calories +
    (t.goal === 'GAIN_MUSCLE' ? 1 : 0.5) *
      (t.proteinG > 0 ? Math.max(0, t.proteinG - protein) / t.proteinG : 0);
  const queues = new Map<MealType, RecipeData[]>(
    (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((k) => [k, shuffle(pools[k])]),
  );
  const used = new Map<MealType, Set<string>>();
  const take = (type: MealType, r: RecipeData) => {
    const q = queues.get(type)!;
    q.push(...q.splice(q.indexOf(r), 1));
    used.set(type, (used.get(type) ?? new Set()).add(r.id));
  };
  const head = (type: MealType) => {
    const q = queues.get(type)!;
    let fresh = q.filter((r) => !used.get(type)?.has(r.id));
    if (fresh.length === 0) {
      used.delete(type);
      fresh = q;
    }
    return fresh.slice(0, 5);
  };
  const out: { kcal: number; protein: number }[] = [];
  for (let day = 0; day < 7; day++) {
    const [bs, ls, ds] = (['breakfast', 'lunch', 'dinner'] as MealType[]).map(head) as [
      RecipeData[],
      RecipeData[],
      RecipeData[],
    ];
    let best = { meals: [] as RecipeData[], s: Infinity, kcal: 0, protein: 0 };
    for (const b of bs)
      for (const l of ls)
        for (const d of ds) {
          const kcal =
            b.nutritionInfo.calories + l.nutritionInfo.calories + d.nutritionInfo.calories;
          const protein =
            b.nutritionInfo.protein + l.nutritionInfo.protein + d.nutritionInfo.protein;
          const s = score(kcal, protein);
          if (s < best.s) best = { meals: [b, l, d], s, kcal, protein };
        }
    best.meals.forEach((r, i) => take((['breakfast', 'lunch', 'dinner'] as MealType[])[i]!, r));
    let { kcal, protein, s } = best;
    for (let added = 0; added < 2 && kcal < t.calories * 0.9; added++) {
      const snack = head('snack').reduce<{ r: RecipeData; s: number } | null>((acc, r) => {
        const sc = score(kcal + r.nutritionInfo.calories, protein + r.nutritionInfo.protein);
        return !acc || sc < acc.s ? { r, s: sc } : acc;
      }, null);
      if (!snack || snack.s >= s) break;
      take('snack', snack.r);
      kcal += snack.r.nutritionInfo.calories;
      protein += snack.r.nutritionInfo.protein;
      s = snack.s;
    }
    out.push({ kcal, protein: Math.round(protein) });
  }
  return out;
}

const seeded = () => {
  let s = 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

// Audit personas (resolveDailyTargets output for each profile).
const PERSONAS: { name: string; targets: CuratedTargets }[] = [
  { name: 'free default (MAINTAIN)', targets: { calories: 2000, proteinG: 125, goal: 'MAINTAIN' } },
  {
    name: 'solo cook (onboarding 2,724)',
    targets: { calories: 2724, proteinG: 170, goal: 'MAINTAIN' },
  },
  {
    name: 'cut (LOSE_WEIGHT 1,600)',
    targets: { calories: 1600, proteinG: 140, goal: 'LOSE_WEIGHT' },
  },
  {
    name: 'gym free (GAIN 2,000, F-PM-4)',
    targets: { calories: 2000, proteinG: 175, goal: 'GAIN_MUSCLE' },
  },
  {
    name: 'lifter (GAIN 2,800, 80 kg)',
    targets: { calories: 2800, proteinG: 176, goal: 'GAIN_MUSCLE' },
  },
  {
    name: 'lifter (GAIN 3,200, 80 kg)',
    targets: { calories: 3200, proteinG: 176, goal: 'GAIN_MUSCLE' },
  },
];

const range = (xs: number[]) => `${Math.min(...xs)}–${Math.max(...xs)}`;
const pct = (v: number, t: number) => Math.round(((v - t) / t) * 1000) / 10;

describe('curated portions: before/after on the real pool (audit P1-1)', () => {
  const rows = PERSONAS.map(({ name, targets }) => {
    const before = beforePlanner(CURATED_POOL_BY_TYPE, targets, seeded());
    const after = planCuratedWeek(CURATED_POOL_BY_TYPE, targets, seeded());
    return { name, targets, before, after };
  });

  it('prints the comparison table', () => {
    const table = rows.map(({ name, targets, before, after }) => ({
      persona: name,
      target: `${targets.calories} kcal / ${targets.proteinG} g`,
      'before kcal': range(before.map((d) => d.kcal)),
      'after kcal': range(after.map((d) => d.kcal)),
      'before protein': range(before.map((d) => d.protein)),
      'after protein': range(after.map((d) => Math.round(d.protein))),
      'worst kcal miss before %': Math.max(
        ...before.map((d) => Math.abs(pct(d.kcal, targets.calories))),
      ),
      'worst kcal miss after %': Math.max(
        ...after.map((d) => Math.abs(pct(d.kcal, targets.calories))),
      ),
      'days with protein hint': after.filter((d) => d.proteinGapG !== null).length,
    }));
    console.table(table);
    expect(table).toHaveLength(PERSONAS.length);
  });

  it.each(PERSONAS.map((p) => p.name))('%s: every day within ±10%% kcal after', (name) => {
    const { targets, after } = rows.find((r) => r.name === name)!;
    for (const day of after) {
      expect(Math.abs(day.kcal - targets.calories) / targets.calories).toBeLessThanOrEqual(0.1);
    }
  });

  it.each(PERSONAS.map((p) => p.name))('%s: protein never worse on average', (name) => {
    const { before, after } = rows.find((r) => r.name === name)!;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(after.map((d) => d.protein))).toBeGreaterThanOrEqual(
      avg(before.map((d) => d.protein)),
    );
  });

  it('flags every protein-short day honestly', () => {
    for (const { targets, after } of rows) {
      for (const day of after) {
        const short = targets.proteinG - day.protein;
        if (day.proteinGapG !== null) expect(day.proteinGapG).toBe(Math.round(short));
        else expect(short).toBeLessThan(Math.max(10, targets.proteinG * 0.1));
      }
    }
  });
});
