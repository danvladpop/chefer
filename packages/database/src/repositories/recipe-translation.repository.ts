import type { RecipeTranslation, TranslationStatus } from '@prisma/client';
import { prisma } from '../client';

// ─── Recipe translations (Lane J phase 3, ADR 0004) ───────────────────────────
// One row per recipe and language. Readers get the translation only while its
// sourceHash still matches the English row (the API checks that); the
// translation pipeline writes drafts, and a person marks them REVIEWED.

/** The English a translation is made from: one curated recipe row. */
export type TranslatableRecipe = {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  /** Recipe.ingredients (Json): `{ name, quantity, unit }[]`. */
  ingredients: unknown;
};

export type UpsertRecipeTranslationData = {
  recipeId: string;
  locale: string;
  name: string;
  description: string;
  instructions: string[];
  ingredientNames: string[];
  source: string;
  sourceHash: string;
};

export interface IRecipeTranslationRepository {
  /** The translations for `recipeIds` in `locale`, any status. */
  findForRecipes(recipeIds: readonly string[], locale: string): Promise<RecipeTranslation[]>;
  /** Every live CURATED recipe, oldest first (the pipeline's work list). */
  findCuratedRecipes(recipeIds?: readonly string[]): Promise<TranslatableRecipe[]>;
  /** Creates or replaces the translation; a replaced one goes back to MACHINE_DRAFT. */
  upsert(data: UpsertRecipeTranslationData): Promise<RecipeTranslation>;
  /** Marks translations reviewed (or back to draft); returns how many changed. */
  setStatus(
    recipeIds: readonly string[],
    locale: string,
    status: TranslationStatus,
  ): Promise<number>;
  /** All translations in `locale` with a status, for the review sheet. */
  findByStatus(locale: string, status: TranslationStatus): Promise<RecipeTranslation[]>;
}

export class RecipeTranslationRepository implements IRecipeTranslationRepository {
  async findForRecipes(recipeIds: readonly string[], locale: string): Promise<RecipeTranslation[]> {
    if (recipeIds.length === 0) return [];
    return prisma.recipeTranslation.findMany({
      where: { recipeId: { in: [...new Set(recipeIds)] }, locale },
    });
  }

  async findCuratedRecipes(recipeIds?: readonly string[]): Promise<TranslatableRecipe[]> {
    return prisma.recipe.findMany({
      where: {
        source: 'CURATED',
        deletedAt: null,
        ...(recipeIds && { id: { in: [...recipeIds] } }),
      },
      select: { id: true, name: true, description: true, instructions: true, ingredients: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsert(data: UpsertRecipeTranslationData): Promise<RecipeTranslation> {
    const { recipeId, locale, ...fields } = data;
    return prisma.recipeTranslation.upsert({
      where: { recipeId_locale: { recipeId, locale } },
      create: { recipeId, locale, ...fields },
      update: { ...fields, status: 'MACHINE_DRAFT' },
    });
  }

  async setStatus(
    recipeIds: readonly string[],
    locale: string,
    status: TranslationStatus,
  ): Promise<number> {
    const { count } = await prisma.recipeTranslation.updateMany({
      where: { recipeId: { in: [...recipeIds] }, locale },
      data: { status },
    });
    return count;
  }

  async findByStatus(locale: string, status: TranslationStatus): Promise<RecipeTranslation[]> {
    return prisma.recipeTranslation.findMany({
      where: { locale, status },
      orderBy: { recipeId: 'asc' },
    });
  }
}

export const recipeTranslationRepository = new RecipeTranslationRepository();
