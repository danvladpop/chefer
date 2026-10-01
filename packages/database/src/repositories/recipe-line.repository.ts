import { Prisma, type NutritionStatus } from '@prisma/client';
import { prisma } from '../client';

// ─── Recipe lines + JSON mirror (docs/plan-ingredient-catalog.md §3) ──────────
// `RecipeIngredient` rows are the source of truth for a recipe's ingredients
// and computed nutrition. `Recipe.ingredients` (Json, {name, quantity, unit}[])
// stays as a mirror that every existing consumer and old mobile binary keeps
// reading (shopping list, pantry, cook mode, images, Carrefour). This is the
// ONE write path for both: rows, mirror and nutrition change together, inside
// one transaction, so they can never disagree. (`upsertRecipes` never updates
// ingredients/nutrition on an existing id, F10, so recomputes must use this.)

/** Same shape as `nutritionFactsSchema` in @chefer/types (this package cannot import it). */
export interface RecipeNutritionFacts {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface RecipeLineWrite {
  /** null only for an unresolved line. */
  ingredientId: string | null;
  /** What the author/AI/importer wrote; never lost. */
  rawName: string;
  quantity: number;
  /** Canonical unit (plan §5.1). */
  unit: string;
  /** Resolved edible grams; null ⇒ unresolved. */
  grams: number | null;
  note?: string | null;
  optional?: boolean;
  /** Name written to the Json mirror; defaults to `rawName`. */
  mirrorName?: string;
}

export interface RecipeNutritionWrite {
  status: NutritionStatus;
  /** Rounded per-serving facts → `nutritionInfo` (the existing shape). */
  perServing: RecipeNutritionFacts;
  /** Whole-recipe totals → `nutritionTotal`; null when not computed (USER_ENTERED). */
  total: RecipeNutritionFacts | null;
}

export interface StoredRecipeLineRow {
  id: string;
  recipeId: string;
  position: number;
  ingredientId: string | null;
  rawName: string;
  quantity: number;
  unit: string;
  grams: number | null;
  note: string | null;
  optional: boolean;
}

export interface IRecipeLineRepository {
  /**
   * Replaces a recipe's lines and rewrites its Json mirror and nutrition in one
   * transaction. Pass `tx` to join a caller's transaction (e.g. recipe create).
   */
  writeLines(
    recipeId: string,
    lines: RecipeLineWrite[],
    nutrition: RecipeNutritionWrite,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  /** Lines of these recipes, ordered by recipe then position. */
  findByRecipeIds(recipeIds: string[]): Promise<StoredRecipeLineRow[]>;
}

/** The legacy `{name, quantity, unit}[]` mirror of `lines`, in line order. */
export function toIngredientsMirror(
  lines: readonly RecipeLineWrite[],
): { name: string; quantity: number; unit: string }[] {
  return lines.map((l) => ({
    name: l.mirrorName ?? l.rawName,
    quantity: l.quantity,
    unit: l.unit,
  }));
}

/** `RecipeIngredient` create rows; `position` is the index in `lines`. */
export function toLineRows(
  recipeId: string,
  lines: readonly RecipeLineWrite[],
): Prisma.RecipeIngredientCreateManyInput[] {
  return lines.map((l, position) => ({
    recipeId,
    position,
    ingredientId: l.ingredientId,
    rawName: l.rawName,
    quantity: l.quantity,
    unit: l.unit,
    grams: l.grams,
    note: l.note ?? null,
    optional: l.optional ?? false,
  }));
}

/** The `Recipe` columns a line write sets. */
export function toNutritionColumns(
  lines: readonly RecipeLineWrite[],
  nutrition: RecipeNutritionWrite,
  now: Date,
): Prisma.RecipeUpdateInput {
  return {
    ingredients: toIngredientsMirror(lines),
    nutritionInfo: { ...nutrition.perServing },
    nutritionTotal: nutrition.total ? { ...nutrition.total } : Prisma.DbNull,
    nutritionStatus: nutrition.status,
    // Typed numbers were not computed, so they carry no computation time.
    nutritionComputedAt: nutrition.status === 'USER_ENTERED' ? null : now,
  };
}

export class RecipeLineRepository implements IRecipeLineRepository {
  async writeLines(
    recipeId: string,
    lines: RecipeLineWrite[],
    nutrition: RecipeNutritionWrite,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (client: Prisma.TransactionClient) => {
      await client.recipeIngredient.deleteMany({ where: { recipeId } });
      if (lines.length > 0) {
        await client.recipeIngredient.createMany({ data: toLineRows(recipeId, lines) });
      }
      await client.recipe.update({
        where: { id: recipeId },
        data: toNutritionColumns(lines, nutrition, new Date()),
      });
    };
    if (tx) await run(tx);
    else await prisma.$transaction(run);
  }

  async findByRecipeIds(recipeIds: string[]): Promise<StoredRecipeLineRow[]> {
    if (recipeIds.length === 0) return [];
    return prisma.recipeIngredient.findMany({
      where: { recipeId: { in: recipeIds } },
      orderBy: [{ recipeId: 'asc' }, { position: 'asc' }],
    });
  }
}

export const recipeLineRepository = new RecipeLineRepository();
