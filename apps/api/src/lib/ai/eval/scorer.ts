import { findSafetyIssues } from '../../curated-recipes/safety.js';
import { NO_RECIPE_SENTINEL } from '../prompts.js';
import type { AiWorkload } from '../routing.js';
import {
  cheferizedRecipeSchema,
  extractedRecipeSchema,
  ingredientPriceEstimateSchema,
  mealPhotoEstimateSchema,
  recipeSchema,
  shoppingListResponseSchema,
  weekPlanResponseSchema,
} from '../schemas.js';
import type {
  CheferizeInput,
  ExtractedRecipe,
  MealPlanInput,
  RecipeData,
  ShoppingListInput,
} from '../types.js';

// ─── Eval scorer (research §5.4 step 2) ───────────────────────────────────────
// Pure functions: an AI output + what the golden case expects in, scores out.
// Used by the eval harness (pnpm ai:eval) and by shadow mode, so a candidate
// provider is judged the same way offline and on sampled live traffic.
//
// Scores:
// - schemaValid — the output passes the same Zod gate production uses;
// - allergenViolations — dishes containing one of the user's ALLERGIES (the
//   P1-2 matcher, the same one production enforces). MUST be 0;
// - restrictionViolations — dishes failing a dietary restriction (includes a
//   missing diet tag, so it is reported but not gated);
// - kcalErrorPct / macroErrorPct — mean absolute % error against the target
//   (plans: per day; extraction/photos/prices: against the golden label).

export interface CaseScores {
  schemaValid: boolean;
  allergenViolations: number;
  restrictionViolations: number;
  kcalErrorPct?: number | undefined;
  macroErrorPct?: number | undefined;
  /** Workload-specific checks in 0..1 (ingredient recall, coverage, day structure…). */
  checks: Record<string, number>;
}

const EMPTY: CaseScores = {
  schemaValid: false,
  allergenViolations: 0,
  restrictionViolations: 0,
  checks: {},
};

function pctError(actual: number, target: number): number | undefined {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return undefined;
  return (Math.abs(actual - target) / target) * 100;
}

function mean(values: (number | undefined)[]): number | undefined {
  const xs = values.filter((v): v is number => v !== undefined && Number.isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

function round1(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 10) / 10;
}

/** Allergy vs restriction violations of a set of dishes. */
function safetyCounts(
  recipes: RecipeData[],
  prefs: { allergies: string[]; dietaryRestrictions: string[] },
): { allergenViolations: number; restrictionViolations: number } {
  let allergenViolations = 0;
  let restrictionViolations = 0;
  for (const recipe of recipes) {
    if (findSafetyIssues(recipe, { allergies: prefs.allergies, dietaryRestrictions: [] }).length) {
      allergenViolations++;
    }
    if (
      findSafetyIssues(recipe, { allergies: [], dietaryRestrictions: prefs.dietaryRestrictions })
        .length
    ) {
      restrictionViolations++;
    }
  }
  return { allergenViolations, restrictionViolations };
}

function asRecipe(extracted: ExtractedRecipe): RecipeData {
  return { ...extracted, id: 'eval', imageUrl: null };
}

// ─── Meal plan ───────────────────────────────────────────────────────────────

/** Per-day kcal/macro targets, honouring a lifter's training-day bump. */
function dayTargets(input: MealPlanInput, dayOfWeek: number) {
  const training = input.trainingDays?.days.some((d) => d.dayOfWeek === dayOfWeek);
  const kcalBonus = training ? (input.trainingDays?.kcalBonus ?? 0) : 0;
  const proteinBonus = training ? (input.trainingDays?.proteinBonus ?? 0) : 0;
  return {
    kcal: input.dailyCalorieTarget + kcalBonus,
    macros: input.macroTargets
      ? { ...input.macroTargets, proteinG: input.macroTargets.proteinG + proteinBonus }
      : undefined,
  };
}

export function scoreMealPlan(input: MealPlanInput, output: unknown): CaseScores {
  const parsed = weekPlanResponseSchema.safeParse(output);
  if (!parsed.success) return { ...EMPTY };
  const plan = parsed.data;

  // The allergy set covers the whole household (meal-plan.service merges it).
  const safety = safetyCounts(
    plan.days.flatMap((d) => d.meals.map((m) => m.recipe)),
    input,
  );

  const kcalErrors: (number | undefined)[] = [];
  const macroErrors: (number | undefined)[] = [];
  for (const day of plan.days) {
    const t = dayTargets(input, day.dayOfWeek);
    const sum = (key: 'calories' | 'protein' | 'carbs' | 'fat') =>
      day.meals.reduce((acc, m) => acc + m.recipe.nutritionInfo[key], 0);
    kcalErrors.push(pctError(sum('calories'), t.kcal));
    if (t.macros) {
      macroErrors.push(
        pctError(sum('protein'), t.macros.proteinG),
        pctError(sum('carbs'), t.macros.carbsG),
        pctError(sum('fat'), t.macros.fatG),
      );
    }
  }

  const distinctDays = new Set(plan.days.map((d) => d.dayOfWeek)).size;
  const daysWithRightMealCount = plan.days.filter(
    (d) => d.meals.length === input.mealsPerDay,
  ).length;
  const names = plan.days.flatMap((d) => d.meals.map((m) => m.recipe.name.trim().toLowerCase()));

  return {
    schemaValid: true,
    ...safety,
    kcalErrorPct: round1(mean(kcalErrors)),
    macroErrorPct: round1(mean(macroErrors)),
    checks: {
      sevenDays: distinctDays === 7 && plan.days.length === 7 ? 1 : 0,
      mealCount: plan.days.length ? daysWithRightMealCount / plan.days.length : 0,
      uniqueDishes: names.length ? new Set(names).size / names.length : 0,
    },
  };
}

// ─── Swap / cheferize ────────────────────────────────────────────────────────

export function scoreSwap(
  prefs: { allergies: string[]; dietaryRestrictions: string[] },
  output: unknown,
): CaseScores {
  const parsed = recipeSchema.safeParse(output);
  if (!parsed.success) return { ...EMPTY };
  return { schemaValid: true, ...safetyCounts([parsed.data], prefs), checks: {} };
}

export function scoreCheferize(input: CheferizeInput, output: unknown): CaseScores {
  const parsed = cheferizedRecipeSchema.safeParse(output);
  if (!parsed.success) return { ...EMPTY };
  const adapted = parsed.data.adapted;
  return {
    schemaValid: true,
    ...safetyCounts([asRecipe(adapted)], input.preferences),
    checks: {
      servings: adapted.servings === input.targetServings ? 1 : 0,
    },
  };
}

// ─── Extraction (text import) ────────────────────────────────────────────────

export interface ImportExpectation {
  /** Words the extracted name must contain (case-insensitive). */
  nameIncludes?: string[] | undefined;
  /** Ingredients that must appear (substring match on ingredient names). */
  keyIngredients?: string[] | undefined;
  kcalPerServing?: number | undefined;
  servings?: number | undefined;
  /** The content holds no recipe: the NO_RECIPE_FOUND sentinel is the right answer. */
  noRecipe?: boolean | undefined;
}

export function scoreExtraction(expected: ImportExpectation, output: unknown): CaseScores {
  const parsed = extractedRecipeSchema.safeParse(output);
  if (!parsed.success) return { ...EMPTY };
  const recipe = parsed.data;
  const isSentinel = recipe.name.trim() === NO_RECIPE_SENTINEL;
  if (expected.noRecipe) {
    return { ...EMPTY, schemaValid: true, checks: { sentinelCorrect: isSentinel ? 1 : 0 } };
  }
  const name = recipe.name.toLowerCase();
  const ingredientNames = recipe.ingredients.map((i) => i.name.toLowerCase());
  const checks: Record<string, number> = { sentinelCorrect: isSentinel ? 0 : 1 };
  if (expected.nameIncludes?.length) {
    checks['nameMatch'] = expected.nameIncludes.every((w) => name.includes(w.toLowerCase()))
      ? 1
      : 0;
  }
  if (expected.keyIngredients?.length) {
    const found = expected.keyIngredients.filter((k) =>
      ingredientNames.some((n) => n.includes(k.toLowerCase())),
    ).length;
    checks['ingredientRecall'] = found / expected.keyIngredients.length;
  }
  if (expected.servings !== undefined) {
    checks['servings'] = recipe.servings === expected.servings ? 1 : 0;
  }
  return {
    schemaValid: true,
    allergenViolations: 0,
    restrictionViolations: 0,
    kcalErrorPct:
      expected.kcalPerServing !== undefined
        ? round1(pctError(recipe.nutritionInfo.calories, expected.kcalPerServing))
        : undefined,
    checks,
  };
}

// ─── Vision (meal photo) ─────────────────────────────────────────────────────

export interface PhotoExpectation {
  /** Labelled kcal of the visible portion; omitted for unlabelled smoke images. */
  kcal?: number | undefined;
  /** Words the dish name should contain. */
  dishIncludes?: string[] | undefined;
}

export function scorePhoto(expected: PhotoExpectation, output: unknown): CaseScores {
  const parsed = mealPhotoEstimateSchema.safeParse(output);
  if (!parsed.success) return { ...EMPTY };
  const checks: Record<string, number> = {};
  if (expected.dishIncludes?.length) {
    const dish = parsed.data.dishName.toLowerCase();
    checks['dishMatch'] = expected.dishIncludes.some((w) => dish.includes(w.toLowerCase())) ? 1 : 0;
  }
  return {
    schemaValid: true,
    allergenViolations: 0,
    restrictionViolations: 0,
    kcalErrorPct:
      expected.kcal !== undefined ? round1(pctError(parsed.data.kcal, expected.kcal)) : undefined,
    checks,
  };
}

// ─── Prices / shopping / review ──────────────────────────────────────────────

export function scorePrices(
  names: string[],
  kcalPer100g: Record<string, number>,
  output: unknown,
): CaseScores {
  const parsed = ingredientPriceEstimateSchema.array().safeParse(output);
  if (!parsed.success) return { ...EMPTY };
  const byName = new Map(parsed.data.map((e) => [e.ingredientName.trim().toLowerCase(), e]));
  const covered = names.filter((n) => byName.has(n.toLowerCase())).length;
  const kcalErrors = Object.entries(kcalPer100g).map(([name, kcal]) => {
    const got = byName.get(name.toLowerCase())?.caloriesPer100g;
    return got == null ? undefined : pctError(got, kcal);
  });
  return {
    schemaValid: true,
    allergenViolations: 0,
    restrictionViolations: 0,
    kcalErrorPct: round1(mean(kcalErrors)),
    checks: { coverage: names.length ? covered / names.length : 0 },
  };
}

export function scoreShopping(input: ShoppingListInput, output: unknown): CaseScores {
  const parsed = shoppingListResponseSchema.safeParse(output);
  if (!parsed.success) return { ...EMPTY };
  const outNames = parsed.data.items.map((i) => i.ingredientName.toLowerCase());
  const distinct = [...new Set(input.ingredients.map((i) => i.name.trim().toLowerCase()))];
  const covered = distinct.filter((n) =>
    outNames.some((o) => o.includes(n) || n.includes(o)),
  ).length;
  return {
    schemaValid: true,
    allergenViolations: 0,
    restrictionViolations: 0,
    checks: {
      coverage: distinct.length ? covered / distinct.length : 0,
      // A consolidated list has no more lines than distinct inputs.
      consolidated: parsed.data.items.length <= distinct.length ? 1 : 0,
    },
  };
}

/** Coach review prose: 4–5 short lines are asked for; allow up to 8. */
export function scoreReview(output: unknown): CaseScores {
  const text = typeof output === 'string' ? output.trim() : '';
  const lines = text.split('\n').filter((l) => l.trim()).length;
  return { ...EMPTY, schemaValid: text.length > 0 && lines <= 8, checks: {} };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface CaseResult {
  id: string;
  ok: boolean;
  error?: string | undefined;
  ms: number;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  scores: CaseScores;
}

export interface EvalSummary {
  workload: AiWorkload;
  provider: string;
  cases: number;
  errors: number;
  schemaValidPct: number;
  allergenViolations: number;
  restrictionViolations: number;
  meanKcalErrorPct?: number | undefined;
  meanMacroErrorPct?: number | undefined;
  /** Mean of each named check across the cases that report it. */
  checks: Record<string, number>;
  p50Ms: number;
  p95Ms: number;
  inputTokens: number;
  outputTokens: number;
  /** The hard gate: zero allergen violations and at least one case run. */
  gatePassed: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function summarise(
  workload: AiWorkload,
  provider: string,
  results: CaseResult[],
): EvalSummary {
  const n = results.length;
  const valid = results.filter((r) => r.scores.schemaValid).length;
  const allergenViolations = results.reduce((s, r) => s + r.scores.allergenViolations, 0);
  const restrictionViolations = results.reduce((s, r) => s + r.scores.restrictionViolations, 0);
  const checkNames = [...new Set(results.flatMap((r) => Object.keys(r.scores.checks)))];
  const checks = Object.fromEntries(
    checkNames.map((c) => [c, round1(mean(results.map((r) => r.scores.checks[c]))) ?? 0]),
  );
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  return {
    workload,
    provider,
    cases: n,
    errors: results.filter((r) => !r.ok).length,
    schemaValidPct: n ? Math.round((valid / n) * 1000) / 10 : 0,
    allergenViolations,
    restrictionViolations,
    meanKcalErrorPct: round1(mean(results.map((r) => r.scores.kcalErrorPct))),
    meanMacroErrorPct: round1(mean(results.map((r) => r.scores.macroErrorPct))),
    checks,
    p50Ms: percentile(ms, 50),
    p95Ms: percentile(ms, 95),
    inputTokens: results.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
    outputTokens: results.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
    gatePassed: n > 0 && allergenViolations === 0,
  };
}

/** A fixed-width text table of one or more summaries. */
export function formatSummaryTable(summaries: EvalSummary[]): string {
  const fmt = (v: number | undefined, suffix = '') => (v === undefined ? '—' : `${v}${suffix}`);
  const header = [
    'workload',
    'provider',
    'cases',
    'errors',
    'schema',
    'allergen',
    'restrict',
    'kcal err',
    'macro err',
    'p50 ms',
    'p95 ms',
    'tokens in/out',
    'checks',
    'gate',
  ];
  const rows = summaries.map((s) => [
    s.workload,
    s.provider,
    String(s.cases),
    String(s.errors),
    `${s.schemaValidPct}%`,
    String(s.allergenViolations),
    String(s.restrictionViolations),
    fmt(s.meanKcalErrorPct, '%'),
    fmt(s.meanMacroErrorPct, '%'),
    String(s.p50Ms),
    String(s.p95Ms),
    `${s.inputTokens}/${s.outputTokens}`,
    Object.entries(s.checks)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ') || '—',
    s.gatePassed ? 'PASS' : 'FAIL',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join(' | ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('-|-'), ...rows.map(line)].join('\n');
}
