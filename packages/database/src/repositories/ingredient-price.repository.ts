import type { IngredientPrice } from '@prisma/client';
import { prisma } from '../client';

// ─── Ingredient catalog search (T-BUG-X7, T-19.1) ──────────────────────────────
// `ingredients.service.ts`'s `search()` used to query `prisma.ingredientPrice`
// directly (CLAUDE.md rule 2: no Prisma calls outside a repository). This is
// the one method that call site needs — a full ingredient-price repository
// (list/update/delete/create/estimate) is a larger, separate change; this
// covers exactly the bug fix and the search-first Log sheet's need for
// per-100g macros (T-19.1).

export interface IngredientCatalogRow {
  ingredientName: string;
  imageUrl: string | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  creatorId: string | null;
}

export interface IIngredientPriceRepository {
  /**
   * Substring match (case-insensitive) over the global vocabulary + the
   * user's own custom rows, ingredient name ascending. `limit` is a raw row
   * cap — the caller re-scores/truncates further (custom rows and prefix
   * matches first).
   */
  searchCatalog(query: string, userId: string, limit: number): Promise<IngredientCatalogRow[]>;
  /**
   * The user's private custom rows that have no catalog `Ingredient` twin yet
   * (created before the ingredient catalog, plan-ingredient-catalog §7 step 2).
   */
  findUnlinkedPrivate(userId: string): Promise<IngredientPrice[]>;
  /** Links a price row to its catalog ingredient. */
  linkIngredient(ingredientName: string, ingredientId: string): Promise<void>;
  /**
   * The price rows linked to these catalog ingredients that `userId` may see
   * (global rows + the user's own), for the Ingredients page's price column
   * and the admin price/image edit (plan-ingredient-catalog §10, D7).
   */
  findLinkedPrices(ingredientIds: string[], userId: string): Promise<LinkedIngredientPrice[]>;
}

/** A price row as the catalog listing shows it next to its `Ingredient`. */
export interface LinkedIngredientPrice {
  ingredientName: string;
  ingredientId: string;
  imageUrl: string | null;
  pricePer100gEur: number | null;
  pricePer100mlEur: number | null;
  pricePerPieceEur: number | null;
  creatorId: string | null;
}

export class IngredientPriceRepository implements IIngredientPriceRepository {
  async searchCatalog(
    query: string,
    userId: string,
    limit: number,
  ): Promise<IngredientCatalogRow[]> {
    return prisma.ingredientPrice.findMany({
      where: {
        ingredientName: { contains: query, mode: 'insensitive' },
        OR: [{ creatorId: null }, { creatorId: userId }],
      },
      orderBy: [{ ingredientName: 'asc' }],
      take: limit,
      select: {
        ingredientName: true,
        imageUrl: true,
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        creatorId: true,
      },
    });
  }

  async findUnlinkedPrivate(userId: string): Promise<IngredientPrice[]> {
    return prisma.ingredientPrice.findMany({
      where: { creatorId: userId, ingredientId: null },
      orderBy: { ingredientName: 'asc' },
    });
  }

  async linkIngredient(ingredientName: string, ingredientId: string): Promise<void> {
    await prisma.ingredientPrice.update({ where: { ingredientName }, data: { ingredientId } });
  }

  async findLinkedPrices(
    ingredientIds: string[],
    userId: string,
  ): Promise<LinkedIngredientPrice[]> {
    if (ingredientIds.length === 0) return [];
    const rows = await prisma.ingredientPrice.findMany({
      where: {
        ingredientId: { in: [...new Set(ingredientIds)] },
        OR: [{ creatorId: null }, { creatorId: userId }],
      },
      orderBy: { ingredientName: 'asc' },
      select: {
        ingredientName: true,
        ingredientId: true,
        imageUrl: true,
        pricePer100gEur: true,
        pricePer100mlEur: true,
        pricePerPieceEur: true,
        creatorId: true,
      },
    });
    return rows.flatMap((r) => (r.ingredientId ? [{ ...r, ingredientId: r.ingredientId }] : []));
  }
}

export const ingredientPriceRepository = new IngredientPriceRepository();
