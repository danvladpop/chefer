import {
  ingredientRepository,
  recipeLineRepository,
  type CatalogIngredientRow,
  type IIngredientRepository,
  type IRecipeLineRepository,
  type RecipeForRecompute,
  type RecipeLineWrite,
} from '@chefer/database';
import {
  computeRecipeNutrition,
  type NutritionLineInput,
  type RecipeNutritionResult,
} from '@chefer/utils';
import { toNutritionIngredient } from './ingredient-resolver.js';

// ─── Computed recipe nutrition over stored lines (plan §5, §8.1) ──────────────
// Server truth for a recipe's numbers: the shared engine over its
// RecipeIngredient rows and the catalog rows its owner may see. Used when a
// private ingredient is edited (every recipe of that owner using it is
// recomputed) and, from P6 on, by every recipe write path.

/** A line the engine computes and the repository stores. */
export interface ComputableLine {
  ingredientId: string | null;
  rawName: string;
  quantity: number;
  unit: string;
  note?: string | null | undefined;
  optional?: boolean | undefined;
}

export class RecipeNutritionService {
  constructor(
    private readonly ingredients: IIngredientRepository = ingredientRepository,
    private readonly lines: IRecipeLineRepository = recipeLineRepository,
  ) {}

  /** Computes `lines` against the rows `ownerId` may see. */
  async compute(
    lines: readonly ComputableLine[],
    ownerId: string | null,
    servings: number,
  ): Promise<{ result: RecipeNutritionResult; rows: Map<string, CatalogIngredientRow> }> {
    const ids = lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : []));
    const rows = new Map(
      (await this.ingredients.findVisibleByIds(ids, ownerId)).map((r) => [r.id, r] as const),
    );
    const engine = new Map([...rows].map(([id, r]) => [id, toNutritionIngredient(r)] as const));
    const input: NutritionLineInput[] = lines.map((l) => ({
      ingredientId: l.ingredientId,
      quantity: l.quantity,
      unit: l.unit,
      optional: l.optional ?? undefined,
    }));
    return { result: computeRecipeNutrition(input, engine, servings), rows };
  }

  /**
   * Recomputes one stored recipe and rewrites its lines, mirror and nutrition.
   * A USER_ENTERED recipe whose lines still do not all resolve keeps its typed
   * numbers (D4), so it is left untouched.
   */
  async recompute(recipe: RecipeForRecompute): Promise<'written' | 'kept-user-entered'> {
    const { result } = await this.compute(recipe.lines, recipe.creatorId, recipe.servings);
    if (recipe.nutritionStatus === 'USER_ENTERED' && result.status !== 'COMPUTED') {
      return 'kept-user-entered';
    }
    const mirror = Array.isArray(recipe.ingredients)
      ? (recipe.ingredients as { name?: unknown }[])
      : [];
    const writes: RecipeLineWrite[] = recipe.lines.map((l, i) => {
      const mirrorName = mirror[i]?.name;
      return {
        ingredientId: l.ingredientId,
        rawName: l.rawName,
        quantity: l.quantity,
        unit: l.unit,
        grams: result.lines[i]?.grams ?? null,
        note: l.note,
        optional: l.optional,
        ...(typeof mirrorName === 'string' ? { mirrorName } : {}),
      };
    });
    await this.lines.writeLines(recipe.id, writes, {
      status: result.status,
      perServing: result.perServing,
      total: result.total,
    });
    return 'written';
  }

  /** Recomputes every recipe that uses `ingredientId` (after a private-ingredient edit). */
  async recomputeRecipesUsing(ingredientId: string): Promise<{ written: number; kept: number }> {
    const recipes = await this.lines.findRecipesUsingIngredient(ingredientId);
    let written = 0;
    let kept = 0;
    for (const recipe of recipes) {
      if ((await this.recompute(recipe)) === 'written') written += 1;
      else kept += 1;
    }
    return { written, kept };
  }
}

export const recipeNutritionService = new RecipeNutritionService();
