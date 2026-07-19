import { TRPCError } from '@trpc/server';
import { prisma } from '@chefer/database';
import { buildPollinationsUrl } from '../../lib/image-gen/pollinations.js';
import { resolveIngredientImage } from '../../lib/ingredient-images/index.js';
import {
  addMacros,
  normalizeIngredientName,
  quantityToGrams,
  RECIPE_UNITS,
  type ComputedNutrition,
} from '../../lib/ingredient-prices/index.js';
import { ingredientPriceWorker } from '../../workers/ingredient-price.worker.js';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface IngredientSearchResult {
  name: string;
  displayName: string;
  imageUrl: string;
  hasMacros: boolean;
  isCustom: boolean;
}

export interface IngredientListItem {
  name: string;
  displayName: string;
  imageUrl: string;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  gramsPerPiece: number | null;
  pricePer100gEur: number | null;
  pricePer100mlEur: number | null;
  pricePerPieceEur: number | null;
  isCustom: boolean;
  /** True when the current user may edit/delete this row (owner, or admin for globals). */
  canEdit: boolean;
  source: string;
}

export interface UpdateIngredientInput {
  name: string;
  imageUrl?: string | null | undefined;
  generateAiImage?: boolean | undefined;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  gramsPerPiece?: number | null | undefined;
  pricePer100gEur?: number | null | undefined;
  pricePer100mlEur?: number | null | undefined;
  pricePerPieceEur?: number | null | undefined;
}

export interface CreateCustomIngredientInput {
  name: string;
  imageUrl?: string | null | undefined;
  generateAiImage?: boolean | undefined;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  gramsPerPiece?: number | null | undefined;
}

export interface NutritionComputationResult {
  /** Per-serving values, rounded. */
  perServing: ComputedNutrition;
  /** Ingredient names that had no macro data (nutrition may be underestimated). */
  unmatched: string[];
  matchedCount: number;
  totalCount: number;
}

function titleCase(name: string): string {
  // Capitalize word starts only (not after apostrophes: "grandma's" → "Grandma's")
  return name.replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());
}

/** Deterministic AI-generated thumbnail for an ingredient (Pollinations, instant URL). */
function ingredientAiImageUrl(name: string): string {
  const prompt =
    `Professional food photography of ${name}, single fresh ingredient on a clean ` +
    `white background, studio lighting, highly detailed, no text, no people.`;
  return buildPollinationsUrl(prompt, name, 'ingredient', 384, 384);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class IngredientsService {
  /**
   * Searches the ingredient catalog: global vocabulary + the user's private
   * custom ingredients. Substring match, custom entries first.
   */
  async search(userId: string, query: string, limit = 12): Promise<IngredientSearchResult[]> {
    const q = normalizeIngredientName(query);
    if (q.length < 2) return [];

    const rows = await prisma.ingredientPrice.findMany({
      where: {
        ingredientName: { contains: q, mode: 'insensitive' },
        OR: [{ creatorId: null }, { creatorId: userId }],
      },
      orderBy: [{ ingredientName: 'asc' }],
      take: limit * 2, // room to sort custom/prefix matches first
    });

    const scored = rows
      .map((r) => ({
        row: r,
        score: (r.creatorId === userId ? 0 : 2) + (r.ingredientName.startsWith(q) ? 0 : 1),
      }))
      .sort((a, b) => a.score - b.score || a.row.ingredientName.localeCompare(b.row.ingredientName))
      .slice(0, limit);

    return Promise.all(
      scored.map(async ({ row }) => ({
        name: row.ingredientName,
        displayName: titleCase(row.ingredientName),
        imageUrl: row.imageUrl ?? (await resolveIngredientImage(row.ingredientName)),
        hasMacros: row.caloriesPer100g != null,
        isCustom: row.creatorId === userId,
      })),
    );
  }

  /**
   * Full-detail catalog listing for the Ingredients page: global vocabulary +
   * the user's private custom rows. Other users' custom rows are never
   * included — not even for admins.
   */
  async list(
    userId: string,
    role: string,
    opts: {
      search?: string | undefined;
      mineOnly?: boolean | undefined;
      limit: number;
      offset: number;
    },
  ): Promise<{ items: IngredientListItem[]; hasMore: boolean }> {
    const where = {
      ...(opts.mineOnly
        ? { creatorId: userId }
        : { OR: [{ creatorId: null }, { creatorId: userId }] }),
      ...(opts.search
        ? {
            ingredientName: {
              contains: normalizeIngredientName(opts.search),
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const rows = await prisma.ingredientPrice.findMany({
      where,
      orderBy: [{ ingredientName: 'asc' }],
      skip: opts.offset,
      take: opts.limit + 1, // one extra row to detect hasMore
    });

    const page = rows.slice(0, opts.limit);
    const items = await Promise.all(
      page.map(async (row) => ({
        name: row.ingredientName,
        displayName: titleCase(row.ingredientName),
        imageUrl: row.imageUrl ?? (await resolveIngredientImage(row.ingredientName)),
        caloriesPer100g: row.caloriesPer100g,
        proteinPer100g: row.proteinPer100g,
        carbsPer100g: row.carbsPer100g,
        fatPer100g: row.fatPer100g,
        fiberPer100g: row.fiberPer100g,
        gramsPerPiece: row.gramsPerPiece,
        pricePer100gEur: row.pricePer100gEur,
        pricePer100mlEur: row.pricePer100mlEur,
        pricePerPieceEur: row.pricePerPieceEur,
        isCustom: row.creatorId === userId,
        canEdit: row.creatorId === userId || (row.creatorId === null && role === 'ADMIN'),
        source: row.source,
      })),
    );

    return { items, hasMore: rows.length > opts.limit };
  }

  /**
   * Permission gate for update/delete. Owners may edit their custom rows;
   * admins may edit global rows. Someone else's custom row is reported as
   * NOT_FOUND so its existence stays hidden.
   */
  private async getEditableRow(userId: string, role: string, name: string) {
    const row = await prisma.ingredientPrice.findUnique({
      where: { ingredientName: normalizeIngredientName(name) },
    });
    if (!row || (row.creatorId !== null && row.creatorId !== userId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ingredient not found.' });
    }
    const isOwner = row.creatorId === userId;
    const isGlobalAdminEdit = row.creatorId === null && role === 'ADMIN';
    if (!isOwner && !isGlobalAdminEdit) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Global ingredients can only be edited by admins.',
      });
    }
    return row;
  }

  /**
   * Updates an editable ingredient. Admin edits of global rows are marked
   * `source: 'ADMIN'` so the weekly AI refresher never overwrites them
   * (user rows are already protected via `source: 'USER'`).
   */
  async update(
    userId: string,
    role: string,
    input: UpdateIngredientInput,
  ): Promise<IngredientListItem> {
    const row = await this.getEditableRow(userId, role, input.name);

    const imageUrl =
      input.imageUrl !== undefined
        ? input.imageUrl
        : input.generateAiImage
          ? ingredientAiImageUrl(row.ingredientName)
          : row.imageUrl;

    const updated = await prisma.ingredientPrice.update({
      where: { ingredientName: row.ingredientName },
      data: {
        imageUrl,
        caloriesPer100g: input.caloriesPer100g,
        proteinPer100g: input.proteinPer100g,
        carbsPer100g: input.carbsPer100g,
        fatPer100g: input.fatPer100g,
        fiberPer100g: input.fiberPer100g,
        gramsPerPiece: input.gramsPerPiece ?? null,
        pricePer100gEur: input.pricePer100gEur ?? row.pricePer100gEur,
        pricePer100mlEur: input.pricePer100mlEur ?? row.pricePer100mlEur,
        pricePerPieceEur: input.pricePerPieceEur ?? row.pricePerPieceEur,
        source: row.creatorId === userId ? 'USER' : 'ADMIN',
        estimatedAt: new Date(),
      },
    });

    return {
      name: updated.ingredientName,
      displayName: titleCase(updated.ingredientName),
      imageUrl: updated.imageUrl ?? (await resolveIngredientImage(updated.ingredientName)),
      caloriesPer100g: updated.caloriesPer100g,
      proteinPer100g: updated.proteinPer100g,
      carbsPer100g: updated.carbsPer100g,
      fatPer100g: updated.fatPer100g,
      fiberPer100g: updated.fiberPer100g,
      gramsPerPiece: updated.gramsPerPiece,
      pricePer100gEur: updated.pricePer100gEur,
      pricePer100mlEur: updated.pricePer100mlEur,
      pricePerPieceEur: updated.pricePerPieceEur,
      isCustom: updated.creatorId === userId,
      canEdit: true,
      source: updated.source,
    };
  }

  /**
   * Deletes an editable ingredient (own custom row, or a global row as admin).
   * A deleted global row re-appears with fresh AI estimates on the next
   * vocabulary sweep if recipes still reference the name.
   */
  async delete(userId: string, role: string, name: string): Promise<{ success: true }> {
    const row = await this.getEditableRow(userId, role, name);
    await prisma.ingredientPrice.delete({ where: { ingredientName: row.ingredientName } });
    return { success: true };
  }

  /**
   * Creates a private custom ingredient for the user (macros entered manually,
   * image uploaded or AI-generated). Never overwritten by the AI refresh worker.
   */
  async createCustom(
    userId: string,
    input: CreateCustomIngredientInput,
  ): Promise<IngredientSearchResult> {
    const name = normalizeIngredientName(input.name);

    const existing = await prisma.ingredientPrice.findUnique({ where: { ingredientName: name } });
    if (existing && existing.creatorId !== userId && existing.creatorId !== null) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Ingredient name is already taken.' });
    }
    if (existing && existing.creatorId === null) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `"${titleCase(name)}" already exists in the catalog — search for it instead.`,
      });
    }

    const imageUrl = input.imageUrl ?? (input.generateAiImage ? ingredientAiImageUrl(name) : null);

    const fields = {
      caloriesPer100g: input.caloriesPer100g,
      proteinPer100g: input.proteinPer100g,
      carbsPer100g: input.carbsPer100g,
      fatPer100g: input.fatPer100g,
      fiberPer100g: input.fiberPer100g,
      gramsPerPiece: input.gramsPerPiece ?? null,
      imageUrl,
      creatorId: userId,
      source: 'USER',
      estimatedAt: new Date(),
    };

    const row = await prisma.ingredientPrice.upsert({
      where: { ingredientName: name },
      create: { ingredientName: name, ...fields },
      update: fields,
    });

    return {
      name: row.ingredientName,
      displayName: titleCase(row.ingredientName),
      imageUrl: row.imageUrl ?? (await resolveIngredientImage(row.ingredientName)),
      hasMacros: true,
      isCustom: true,
    };
  }

  /**
   * Computes per-serving nutrition from ingredient lines using catalog macros.
   * Unknown ingredients are reported back and queued for AI estimation.
   */
  async computeNutrition(
    userId: string,
    ingredients: { name: string; quantity: number; unit: string }[],
    servings: number,
  ): Promise<NutritionComputationResult> {
    const names = ingredients.map((i) => normalizeIngredientName(i.name));
    const rows = await prisma.ingredientPrice.findMany({
      where: {
        ingredientName: { in: names },
        OR: [{ creatorId: null }, { creatorId: userId }],
      },
    });
    const rowMap = new Map(rows.map((r) => [r.ingredientName, r]));

    const total: ComputedNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    const unmatched: string[] = [];

    for (const ing of ingredients) {
      const row = rowMap.get(normalizeIngredientName(ing.name));
      const grams = row ? quantityToGrams(ing.quantity, ing.unit, row.gramsPerPiece) : null;
      const added = row && grams != null ? addMacros(total, row, grams) : false;
      if (!added) unmatched.push(ing.name);
    }

    // Queue unknown ingredients for AI estimation so they resolve for next time
    if (unmatched.length > 0) ingredientPriceWorker.wake();

    const s = Math.max(1, servings);
    const round1 = (v: number) => Math.round((v / s) * 10) / 10;
    return {
      perServing: {
        calories: Math.round(total.calories / s),
        protein: round1(total.protein),
        carbs: round1(total.carbs),
        fat: round1(total.fat),
        fiber: round1(total.fiber),
      },
      unmatched,
      matchedCount: ingredients.length - unmatched.length,
      totalCount: ingredients.length,
    };
  }

  /** Canonical unit list for recipe forms. */
  getUnits(): readonly string[] {
    return RECIPE_UNITS;
  }
}

export const ingredientsService = new IngredientsService();
