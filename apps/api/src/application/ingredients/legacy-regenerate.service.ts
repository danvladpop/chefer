import {
  ingredientRepository,
  recipeLineRepository,
  type IIngredientRepository,
  type IRecipeLineRepository,
  type RecipeLineWrite,
  type StoredRecipeLineRow,
} from '@chefer/database';
import type { NutritionStatus } from '@chefer/types';
import { normalizeRecipeUnit } from '@chefer/utils';
import { aiService } from '../../lib/ai/index.js';
import type { IAIService, RecipeLineRepairRequest } from '../../lib/ai/types.js';
import { catalogSlugList } from '../meal-plan/ai-recipe-catalog.js';
import { ingredientResolver, type IngredientResolver } from './ingredient-resolver.js';
import { recipeNutritionService, type RecipeNutritionService } from './recipe-nutrition.service.js';

// ─── Regenerating incomplete legacy AI recipes (owner decision 2026-10-02) ────
// After the §7 migration some old AI recipes stay PARTIAL: a line the catalog
// can't weigh ("1 block tofu", "1 portion leftover kofta"). Their bad LINES are
// regenerated with the same repair round new AI recipes get (§6.3): the model
// names a catalog slug and an amount, never a nutrition number, and the server
// recomputes. The dish itself — name, instructions, the other lines — is kept,
// because these recipes sit in users' existing plans. Up to `rounds` rounds;
// a recipe that still doesn't compute keeps its improved lines and stays
// PARTIAL (reported).

export interface LegacyRecipe {
  id: string;
  name: string;
  creatorId: string | null;
  servings: number;
  /** The Json mirror, so unchanged lines keep their display name and unit. */
  ingredients: unknown;
  nutritionInfo: unknown;
  lines: StoredRecipeLineRow[];
}

export interface RegenerateOutcome {
  recipeId: string;
  name: string;
  status: NutritionStatus;
  oldKcal: number | null;
  newKcal: number;
  /** "tofu (1 block) → tofu-firm 350 g" per regenerated line. */
  changes: string[];
  /** Lines that still don't compute. */
  remaining: string[];
}

type WorkLine = StoredRecipeLineRow & { regenerated?: string };

const BATCH = 40;

export class LegacyRecipeRegenerator {
  constructor(
    private readonly ai: Pick<IAIService, 'repairRecipeLines'> = aiService,
    private readonly resolver: Pick<IngredientResolver, 'resolveMany'> = ingredientResolver,
    private readonly catalog: Pick<
      IIngredientRepository,
      'findGlobalIdsBySlugs'
    > = ingredientRepository,
    private readonly nutrition: Pick<RecipeNutritionService, 'compute'> = recipeNutritionService,
    private readonly lines: Pick<IRecipeLineRepository, 'writeLines'> = recipeLineRepository,
  ) {}

  async regenerate(
    recipes: readonly LegacyRecipe[],
    opts: { dryRun: boolean; rounds?: number; catalogSlugs?: string },
  ): Promise<RegenerateOutcome[]> {
    const catalogSlugs = opts.catalogSlugs ?? catalogSlugList(null);
    const work = new Map(recipes.map((r) => [r.id, r.lines.map((l): WorkLine => ({ ...l }))]));
    const byId = new Map(recipes.map((r) => [r.id, r]));

    for (let round = 0; round < (opts.rounds ?? 2); round++) {
      const problems: { recipe: LegacyRecipe; line: WorkLine; problem: string }[] = [];
      for (const r of recipes) {
        const lines = work.get(r.id) ?? [];
        const { result } = await this.nutrition.compute(lines, r.creatorId, r.servings);
        if (result.status === 'COMPUTED') continue;
        for (const l of result.lines) {
          const line = lines[l.position];
          if (l.problem && !l.optional && line)
            problems.push({ recipe: r, line, problem: l.problem });
        }
      }
      if (problems.length === 0) break;

      for (let i = 0; i < problems.length; i += BATCH) {
        const batch = problems.slice(i, i + BATCH);
        const candidates = await this.resolver.resolveMany(
          batch.map((p) => ({ rawName: p.line.rawName })),
          null,
          { candidateLimit: 3 },
        );
        const request: RecipeLineRepairRequest = {
          catalogSlugs,
          lines: batch.map((p, k) => ({
            id: `${p.recipe.id}::${p.line.position}`,
            recipeName: p.recipe.name,
            rawName: p.line.rawName,
            quantity: p.line.quantity,
            unit: p.line.unit,
            problem: p.problem,
            candidates: [
              ...(candidates[k]?.match ? [candidates[k].match.slug] : []),
              ...(candidates[k]?.candidates ?? []).map((c) => c.slug),
            ].slice(0, 3),
          })),
        };
        let fixes: Awaited<ReturnType<IAIService['repairRecipeLines']>> = [];
        try {
          fixes = await this.ai.repairRecipeLines(request);
        } catch (err) {
          console.warn('[legacy-regenerate] repair call failed:', err);
          continue;
        }
        const ids = await this.catalog.findGlobalIdsBySlugs([...new Set(fixes.map((f) => f.slug))]);
        for (const f of fixes) {
          const sep = f.id.lastIndexOf('::');
          const recipeId = f.id.slice(0, sep);
          const position = Number(f.id.slice(sep + 2));
          const line = work.get(recipeId)?.find((l) => l.position === position);
          const ingredientId = ids.get(f.slug);
          // An amount over 2 kg/l for one recipe line is a model slip, not a regeneration.
          if (!line || !ingredientId || !(f.quantity > 0) || f.quantity > 2000) continue;
          const unit = normalizeRecipeUnit(f.unit).unit || f.unit;
          line.regenerated = `${line.rawName} (${line.quantity} ${line.unit}) → ${f.slug} ${f.quantity} ${unit}`;
          line.ingredientId = ingredientId;
          line.quantity = f.quantity;
          line.unit = unit;
        }
      }
    }

    const out: RegenerateOutcome[] = [];
    for (const [id, lines] of work) {
      const r = byId.get(id);
      if (!r) continue;
      const { result } = await this.nutrition.compute(lines, r.creatorId, r.servings);
      const changes = lines.flatMap((l) => (l.regenerated ? [l.regenerated] : []));
      const remaining = result.lines.flatMap((l) =>
        l.problem && !l.optional ? [`${lines[l.position]?.rawName ?? '?'}: ${l.problem}`] : [],
      );
      out.push({
        recipeId: id,
        name: r.name,
        status: result.status,
        oldKcal: kcalOf(r.nutritionInfo),
        newKcal: result.perServing.calories,
        changes,
        remaining,
      });
      if (opts.dryRun || changes.length === 0) continue;
      const mirror = Array.isArray(r.ingredients)
        ? (r.ingredients as { name?: unknown; unit?: unknown }[])
        : [];
      const writes: RecipeLineWrite[] = lines.map((l, i) => {
        const mirrorName = mirror[i]?.name;
        const mirrorUnit = mirror[i]?.unit;
        return {
          ingredientId: l.ingredientId,
          rawName: l.rawName,
          quantity: l.quantity,
          unit: l.unit,
          grams: result.lines[i]?.grams ?? null,
          note: l.regenerated
            ? [l.note, `regenerated 2026-10-02 (was ${l.regenerated.split(' → ')[0]})`]
                .filter(Boolean)
                .join('; ')
            : l.note,
          optional: l.optional,
          ...(typeof mirrorName === 'string' ? { mirrorName } : {}),
          // A regenerated line shows its new amount; others keep the author's unit.
          ...(!l.regenerated && typeof mirrorUnit === 'string' ? { mirrorUnit } : {}),
        };
      });
      await this.lines.writeLines(id, writes, {
        status: result.status,
        perServing: result.perServing,
        total: result.total,
      });
    }
    return out;
  }
}

function kcalOf(info: unknown): number | null {
  const v = (info as { calories?: unknown } | null)?.calories;
  return typeof v === 'number' ? v : null;
}

export const legacyRecipeRegenerator = new LegacyRecipeRegenerator();
