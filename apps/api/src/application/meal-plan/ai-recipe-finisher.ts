import {
  ingredientRepository,
  recipeLineRepository,
  type IIngredientRepository,
  type IRecipeLineRepository,
  type RecipeLineWrite,
} from '@chefer/database';
import { aiService } from '../../lib/ai/index.js';
import type {
  DayPlan,
  IAIService,
  MealType,
  RecipeData,
  RecipeLineRepairRequest,
  SwapInput,
} from '../../lib/ai/types.js';
import { ingredientResolver, type IngredientResolver } from '../ingredients/ingredient-resolver.js';
import { catalogRepairRows, repairRejection } from '../ingredients/repair-guard.js';
import {
  computeAiRecipe,
  fitToSlotTarget,
  slotTargets,
  type AiLineProblem,
} from './ai-recipe-catalog.js';

// ─── Finishing AI recipes (plan-ingredient-catalog §6.3) ──────────────────────
// Every AI recipe is turned into a catalog-computed one before anything reads
// its numbers:
//   1. compute from slugs (a bad slug is fixed only by an EXACT/ALIAS match);
//   2. ONE repair round for all remaining problem lines, with the resolver's
//      top-3 candidates (global rows only — AI recipes are shared content);
//   3. a recipe still broken is regenerated once (generateRecipeSwap) and, if
//      that fails too, replaced by a safe curated recipe — or the slot is
//      dropped. An AI recipe is never stored PARTIAL;
//   4. each AI recipe is scaled toward its slot's share of the day target.
// `persistLines` then writes the catalog lines of the recipes being stored.

const CURATED_PREFIX = 'curated-';

export interface FinishContext {
  catalogSlugs: string;
  /** The day's kcal target for a weekday (training days included). */
  dayTarget(dayOfWeek: number): number;
  /** Input for regenerating one slot of `mealType`. */
  swapInput(mealType: MealType, originalRecipeName: string): SwapInput;
  /** A safe curated recipe for the meal type (last resort), or null. */
  fallback(mealType: MealType): RecipeData | null;
  /** False when there is no time left for extra AI calls (live tailoring's deadline). */
  canCallAi?(): boolean;
}

export interface FinishStats {
  recipes: number;
  lines: number;
  /** Lines that computed on the first pass (slug valid, or EXACT/ALIAS fix). */
  resolvedFirstPass: number;
  repairedLines: number;
  regenerated: number;
  fellBackToCurated: number;
  dropped: number;
  fitted: number;
}

export type AiFinisherAi = Pick<IAIService, 'repairRecipeLines' | 'generateRecipeSwap'>;

export class AiRecipeFinisher {
  constructor(
    private readonly ai: AiFinisherAi = aiService,
    private readonly resolver: Pick<IngredientResolver, 'resolveMany'> = ingredientResolver,
    private readonly ingredients: Pick<
      IIngredientRepository,
      'findGlobalIdsBySlugs'
    > = ingredientRepository,
    private readonly lines: Pick<IRecipeLineRepository, 'writeLines'> = recipeLineRepository,
  ) {}

  /** Finishes every AI recipe of a plan (curated slots pass through). */
  async finishPlan<T extends { days: DayPlan[] }>(
    plan: T,
    ctx: FinishContext,
  ): Promise<{ plan: T; stats: FinishStats }> {
    const stats: FinishStats = {
      recipes: 0,
      lines: 0,
      resolvedFirstPass: 0,
      repairedLines: 0,
      regenerated: 0,
      fellBackToCurated: 0,
      dropped: 0,
      fitted: 0,
    };

    // 1. compute
    type Slot = { day: number; meal: number; recipe: RecipeData; problems: AiLineProblem[] };
    const slots: Slot[] = [];
    plan.days.forEach((d, day) =>
      d.meals.forEach((m, meal) => {
        if (m.recipe.id.startsWith(CURATED_PREFIX)) return;
        const c = computeAiRecipe(m.recipe);
        stats.recipes += 1;
        stats.lines += c.recipe.ingredients.length;
        stats.resolvedFirstPass += c.recipe.ingredients.length - c.problems.length;
        slots.push({ day, meal, recipe: c.recipe, problems: c.problems });
      }),
    );

    // 2. one repair round for every problem line of the plan
    const broken = slots.filter((s) => s.problems.length > 0);
    const canCallAi = () => ctx.canCallAi?.() ?? true;
    if (broken.length > 0 && canCallAi()) {
      const repaired = await this.repair(
        broken.map((s, i) => ({ key: String(i), recipe: s.recipe, problems: s.problems })),
        ctx,
      );
      broken.forEach((s, i) => {
        const r = repaired.get(String(i));
        if (!r) return;
        stats.repairedLines += r.fixedLines;
        s.recipe = r.recipe;
        s.problems = r.problems;
      });
    }

    // 3. regenerate, then curated fallback, then drop
    const drop = new Set<string>();
    for (const s of slots.filter((x) => x.problems.length > 0)) {
      const type = plan.days[s.day]?.meals[s.meal]?.type;
      if (!type) continue;
      const replacement = canCallAi() ? await this.regenerate(type, s.recipe.name, ctx) : null;
      if (replacement) {
        stats.regenerated += 1;
        s.recipe = replacement;
        s.problems = [];
        continue;
      }
      const curated = ctx.fallback(type);
      if (curated) {
        stats.fellBackToCurated += 1;
        s.recipe = curated;
        s.problems = [];
      } else {
        stats.dropped += 1;
        drop.add(`${s.day}:${s.meal}`);
      }
    }

    // 4. fit AI recipes to their slot share of the day target
    const bySlot = new Map(slots.map((s) => [`${s.day}:${s.meal}`, s.recipe]));
    const days = plan.days.map((d, day) => {
      const targets = slotTargets(
        ctx.dayTarget(d.dayOfWeek),
        d.meals.map((m) => m.type),
      );
      const meals = d.meals.flatMap((m, meal) => {
        const key = `${day}:${meal}`;
        if (drop.has(key)) return [];
        const recipe = bySlot.get(key);
        if (!recipe) return [m];
        if (recipe.id.startsWith(CURATED_PREFIX)) return [{ ...m, recipe }];
        const fitted = fitToSlotTarget(recipe, targets[meal] ?? 0);
        if (fitted !== recipe) stats.fitted += 1;
        return [{ ...m, recipe: fitted }];
      });
      return { ...d, meals };
    });
    return { plan: { ...plan, days }, stats };
  }

  /**
   * Finishes one AI recipe (swap): compute → repair → regenerate once →
   * null (the caller falls back), then fit to `targetKcal`.
   */
  async finishRecipe(
    recipe: RecipeData,
    mealType: MealType,
    targetKcal: number,
    ctx: Pick<FinishContext, 'catalogSlugs' | 'swapInput'>,
  ): Promise<RecipeData | null> {
    let c = computeAiRecipe(recipe);
    if (c.problems.length > 0) {
      const repaired = (
        await this.repair([{ key: '0', recipe: c.recipe, problems: c.problems }], ctx)
      ).get('0');
      if (repaired?.problems.length === 0) c = { ...c, recipe: repaired.recipe, problems: [] };
    }
    let finished: RecipeData | null = c.problems.length === 0 ? c.recipe : null;
    finished ??= await this.regenerate(mealType, recipe.name, ctx);
    return finished ? fitToSlotTarget(finished, targetKcal) : null;
  }

  /** The repair round: one AI call for all problem lines, then recompute. */
  private async repair(
    items: { key: string; recipe: RecipeData; problems: AiLineProblem[] }[],
    ctx: Pick<FinishContext, 'catalogSlugs'>,
  ): Promise<Map<string, { recipe: RecipeData; problems: AiLineProblem[]; fixedLines: number }>> {
    const out = new Map<
      string,
      { recipe: RecipeData; problems: AiLineProblem[]; fixedLines: number }
    >();
    const flat = items.flatMap((it) => it.problems.map((p) => ({ it, p })));
    if (flat.length === 0) return out;
    const candidates = await this.resolver.resolveMany(
      flat.map(({ p }) => ({ rawName: p.rawName })),
      null,
      { candidateLimit: 3 },
    );
    const request: RecipeLineRepairRequest = {
      catalogSlugs: ctx.catalogSlugs,
      lines: flat.map(({ it, p }, i) => ({
        id: `${it.key}:${p.lineIndex}`,
        recipeName: it.recipe.name,
        rawName: p.rawName,
        slug: p.slug,
        quantity: p.quantity,
        unit: p.unit,
        problem: p.problem,
        candidates: [
          ...(candidates[i]?.match ? [candidates[i].match.slug] : []),
          ...(candidates[i]?.candidates ?? []).map((c) => c.slug),
        ].slice(0, 3),
      })),
    };
    let fixes: Awaited<ReturnType<AiFinisherAi['repairRecipeLines']>> = [];
    try {
      fixes = await this.ai.repairRecipeLines(request);
    } catch (err) {
      console.warn('[ai-recipes] repair round failed; regenerating instead:', err);
    }
    const byId = new Map(fixes.map((f) => [f.id, f]));
    const asked = new Map(request.lines.map((l) => [l.id, l]));
    for (const it of items) {
      const ingredients = it.recipe.ingredients.map((line, idx) => {
        const id = `${it.key}:${idx}`;
        const fix = byId.get(id);
        const ask = asked.get(id);
        if (!fix || !ask) return line;
        // repair-guard.ts: a copied count or a look-alike food stays a problem line.
        const why = repairRejection(
          {
            rawName: ask.rawName,
            quantity: ask.quantity,
            unit: ask.unit,
            // A valid slug whose only problem is the unit must be kept.
            slug: ask.problem === 'NO_INGREDIENT' ? undefined : ask.slug,
            candidates: ask.candidates,
          },
          fix,
          catalogRepairRows().get(fix.slug),
        );
        if (why) {
          console.warn(`[ai-recipes] repair refused for "${ask.rawName}": ${why}`);
          return line;
        }
        return { ...line, slug: fix.slug, quantity: fix.quantity, unit: fix.unit };
      });
      const c = computeAiRecipe({ ...it.recipe, ingredients });
      out.set(it.key, {
        recipe: c.recipe,
        problems: c.problems,
        fixedLines: it.problems.length - c.problems.length,
      });
    }
    return out;
  }

  /** Regenerates one slot once; null when the new recipe still doesn't compute. */
  private async regenerate(
    mealType: MealType,
    originalName: string,
    ctx: Pick<FinishContext, 'swapInput'>,
  ): Promise<RecipeData | null> {
    try {
      const fresh = await this.ai.generateRecipeSwap(ctx.swapInput(mealType, originalName));
      const c = computeAiRecipe(fresh);
      return c.problems.length === 0 ? c.recipe : null;
    } catch (err) {
      console.warn('[ai-recipes] slot regeneration failed:', err);
      return null;
    }
  }

  /**
   * Writes the catalog lines of AI recipes that are being stored (after the
   * row upsert): every line is linked to its global row, status COMPUTED. If
   * the catalog is not synced into this database, the rows keep their
   * computed Json numbers and the lines are skipped (logged).
   */
  async persistLines(recipes: readonly RecipeData[]): Promise<void> {
    const ai = recipes.filter((r) => !r.id.startsWith(CURATED_PREFIX));
    if (ai.length === 0) return;
    const slugs = [
      ...new Set(ai.flatMap((r) => r.ingredients.flatMap((i) => (i.slug ? [i.slug] : [])))),
    ];
    const ids = await this.ingredients.findGlobalIdsBySlugs(slugs);
    for (const recipe of ai) {
      const c = computeAiRecipe(recipe);
      if (c.problems.length > 0 || c.recipe.ingredients.some((i) => !i.slug || !ids.has(i.slug))) {
        console.warn(`[ai-recipes] lines not written for ${recipe.id} (catalog not synced?)`);
        continue;
      }
      const lines: RecipeLineWrite[] = c.recipe.ingredients.map((i, k) => ({
        ingredientId: i.slug ? (ids.get(i.slug) ?? null) : null,
        rawName: i.name,
        quantity: i.quantity,
        unit: i.unit,
        grams: c.result.lines[k]?.grams ?? null,
        note: i.note ?? null,
        optional: i.optional ?? false,
      }));
      await this.lines.writeLines(recipe.id, lines, {
        status: c.result.status,
        perServing: c.result.perServing,
        total: c.result.total,
      });
    }
  }
}

export const aiRecipeFinisher = new AiRecipeFinisher();
