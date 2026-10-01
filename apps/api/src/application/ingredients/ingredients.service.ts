import { TRPCError } from '@trpc/server';
import {
  ingredientPriceRepository,
  ingredientRepository,
  prisma,
  type CatalogIngredientRow,
  type IIngredientRepository,
  type IngredientCategory,
  type IngredientPrice,
  type NutritionSource,
} from '@chefer/database';
import type { LineProblem, NutritionStatus, UserProfile } from '@chefer/types';
import { ingredientSlug, normalizeIngredientKey } from '@chefer/utils';
import { toFriendlyAiError } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import { buildPollinationsUrl } from '../../lib/image-gen/pollinations.js';
import { resolveIngredientImage } from '../../lib/ingredient-images/index.js';
import {
  normalizeIngredientName,
  RECIPE_UNITS,
  type ComputedNutrition,
} from '../../lib/ingredient-prices/index.js';
import { reserveNutritionEstimate } from '../../lib/quotas.js';
import {
  ingredientResolver,
  type IngredientResolver,
  type ResolveConfidence,
} from './ingredient-resolver.js';
import { recipeNutritionService, type RecipeNutritionService } from './recipe-nutrition.service.js';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface IngredientSearchResult {
  name: string;
  displayName: string;
  imageUrl: string;
  hasMacros: boolean;
  isCustom: boolean;
  /**
   * Per-100g macros (T-19.1: the Log sheet's grams row needs these to show a
   * live kcal as the user picks 50/100/150/200 g). Null when the catalog row
   * has no macro data yet (`hasMacros: false`) — additive, older clients
   * ignore it.
   */
  per100g: { calories: number; protein: number; carbs: number; fat: number } | null;
  // ── Catalog fields (plan-ingredient-catalog §9). Additive: older clients
  // ignore them. Absent only on a legacy custom row with no catalog twin yet.
  /** Catalog ingredient id: new clients store it on the recipe line. */
  id?: string;
  slug?: string;
  category?: IngredientCategory;
  owner?: 'global' | 'mine';
  portions?: { unit: string; grams: number }[];
  hasDensity?: boolean;
  nutritionSource?: NutritionSource;
}

/** A catalog row as search/resolve return it (plan §9). */
export interface CatalogIngredientRef {
  id: string;
  slug: string;
  /** Display name ("Chicken breast, raw"). */
  name: string;
  category: IngredientCategory;
  owner: 'global' | 'mine';
  portions: { unit: string; grams: number }[];
  hasDensity: boolean;
  nutritionSource: NutritionSource;
}

/** Full nutrition for client-side live preview with @chefer/utils (`ingredients.getMany`). */
export interface CatalogIngredientDetail extends CatalogIngredientRef {
  status: 'ACTIVE' | 'MERGED' | 'DEPRECATED';
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number | null;
    satFat: number | null;
    sodiumMg: number | null;
  };
  densityGPerMl: number | null;
  edibleFraction: number;
  sourceRef: string | null;
}

export interface ResolvedLineDto {
  rawName: string;
  unit: string;
  note: string | null;
  confidence: ResolveConfidence;
  match: CatalogIngredientRef | null;
  candidates: CatalogIngredientRef[];
  unitProblem?: LineProblem;
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
  /** Catalog id of a private ingredient (new clients); `name` addresses the legacy price row. */
  id?: string | undefined;
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
  /** The user saw "Chefer already has …" and says theirs is different (plan §8.1). */
  confirmDifferent?: boolean | undefined;
  category?: IngredientCategory | undefined;
  densityGPerMl?: number | null | undefined;
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

export interface NutritionComputationLine {
  name: string;
  quantity: number;
  unit: string;
  /** Picked from the catalog (new clients); otherwise the name is resolved. */
  ingredientId?: string | undefined;
  optional?: boolean | undefined;
}

export interface NutritionComputationResult {
  /** Per-serving values, rounded (§5.4). */
  perServing: ComputedNutrition;
  /** Names of lines that could not be computed (nutrition is incomplete). */
  unmatched: string[];
  matchedCount: number;
  totalCount: number;
  // ── Additive (plan §9) ──
  status: Extract<NutritionStatus, 'COMPUTED' | 'PARTIAL'>;
  lines: {
    position: number;
    name: string;
    ingredientId: string | null;
    grams: number | null;
    calories: number;
    protein: number;
    problem?: LineProblem;
  }[];
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

/**
 * The name a free-text line should carry for this row: an alias, so it
 * resolves back to the row. Prefer the alias equal to the display name or the
 * slug ("olive oil"), not the alphabetically first one ("evoo").
 */
function primaryAlias(row: CatalogIngredientRow): string {
  const preferred = [normalizeIngredientKey(row.name), row.slug.replace(/-/g, ' ')];
  for (const key of preferred) if (row.aliases.some((a) => a.alias === key)) return key;
  return (row.aliases.find((a) => a.locale === 'en') ?? row.aliases[0])?.alias ?? row.name;
}

function toRef(row: CatalogIngredientRow, userId: string | null): CatalogIngredientRef {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    owner: row.ownerId !== null && row.ownerId === userId ? 'mine' : 'global',
    portions: row.portions.map((p) => ({ unit: p.unit, grams: p.grams })),
    hasDensity: row.densityGPerMl != null,
    nutritionSource: row.nutritionSource,
  };
}

/** The catalog fields search results add: everything but the display name, since `name` keeps its legacy meaning. */
function refFields(
  row: CatalogIngredientRow,
  userId: string | null,
): Omit<CatalogIngredientRef, 'name'> {
  const { name: _display, ...rest } = toRef(row, userId);
  return rest;
}

function toDetail(row: CatalogIngredientRow, userId: string | null): CatalogIngredientDetail {
  return {
    ...toRef(row, userId),
    status: row.status,
    per100g: {
      calories: row.kcalPer100g,
      protein: row.proteinPer100g,
      carbs: row.carbsPer100g,
      fat: row.fatPer100g,
      fiber: row.fiberPer100g,
      sugar: row.sugarPer100g,
      satFat: row.satFatPer100g,
      sodiumMg: row.sodiumMgPer100g,
    },
    densityGPerMl: row.densityGPerMl,
    edibleFraction: row.edibleFraction,
    sourceRef: row.sourceRef,
  };
}

/** Search rank of one alias hit: exact, prefix, word-start, substring. */
function aliasRank(alias: string, key: string): number {
  if (alias === key) return 0;
  if (alias.startsWith(key)) return 1;
  if (alias.includes(` ${key}`)) return 2;
  return 3;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class IngredientsService {
  constructor(
    private readonly catalog: IIngredientRepository = ingredientRepository,
    private readonly resolver: IngredientResolver = ingredientResolver,
    private readonly nutrition: RecipeNutritionService = recipeNutritionService,
  ) {}

  /**
   * Gives each of the user's pre-catalog custom ingredients (legacy price rows)
   * a private catalog twin, so search, resolve and compute see them (plan §7
   * step 2, done lazily per user). Rows missing a core macro stay unlinked.
   */
  async ensurePrivateTwins(userId: string): Promise<void> {
    const legacy = await ingredientPriceRepository.findUnlinkedPrivate(userId);
    for (const row of legacy) {
      const twin = await this.twinFor(userId, row);
      if (twin) await ingredientPriceRepository.linkIngredient(row.ingredientName, twin.id);
    }
  }

  private async twinFor(
    userId: string,
    row: IngredientPrice,
  ): Promise<CatalogIngredientRow | null> {
    const { caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g } = row;
    if (
      caloriesPer100g == null ||
      proteinPer100g == null ||
      carbsPer100g == null ||
      fatPer100g == null
    )
      return null;
    const slug = ingredientSlug(row.ingredientName);
    if (!slug) return null;
    const existing = await this.catalog.findPrivateBySlug(userId, slug);
    if (existing) return existing;
    return this.catalog.createPrivate(userId, slug, {
      name: titleCase(row.ingredientName),
      category: 'OTHER',
      kcalPer100g: caloriesPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      fiberPer100g: row.fiberPer100g ?? 0,
      imageUrl: row.imageUrl,
      aliases: [normalizeIngredientKey(row.ingredientName)],
      portions: row.gramsPerPiece ? [{ unit: 'piece', grams: row.gramsPerPiece }] : [],
    });
  }

  /**
   * Searches the catalog (plan §9): global rows + the user's private rows,
   * matched on any alias, diacritic-free. Ranked exact → prefix → word-start →
   * substring, the user's own rows first within a rank. The legacy fields keep
   * their meaning: `name` is the alias the query matched, so an old client
   * that writes it into a free-text line resolves back to this row.
   */
  async search(
    userId: string,
    query: string,
    limit = 12,
    opts: { category?: IngredientCategory | undefined } = {},
  ): Promise<IngredientSearchResult[]> {
    const key = normalizeIngredientKey(query);
    if (key.length < 2) return [];
    await this.ensurePrivateTwins(userId);

    const hits = await this.catalog.searchByAlias(key, userId, {
      category: opts.category,
      limit: limit * 8,
    });
    const byId = new Map<string, { row: CatalogIngredientRow; rank: number; alias: string }>();
    for (const { alias, ingredient } of hits) {
      const r = aliasRank(alias, key);
      const cur = byId.get(ingredient.id);
      if (!cur || r < cur.rank || (r === cur.rank && alias.length < cur.alias.length))
        byId.set(ingredient.id, { row: ingredient, rank: r, alias });
    }
    const ranked = [...byId.values()]
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          Number(b.row.ownerId === userId) - Number(a.row.ownerId === userId) ||
          a.alias.length - b.alias.length ||
          a.row.name.localeCompare(b.row.name),
      )
      .slice(0, limit);

    return Promise.all(
      ranked.map(async ({ row, alias }) => {
        // The alias the query matched: what the user was looking for.
        const name = alias;
        return {
          name,
          displayName: row.name,
          imageUrl: row.imageUrl ?? (await resolveIngredientImage(name)),
          hasMacros: true,
          isCustom: row.ownerId === userId,
          per100g: {
            calories: row.kcalPer100g,
            protein: row.proteinPer100g,
            carbs: row.carbsPer100g,
            fat: row.fatPer100g,
          },
          ...refFields(row, userId),
        };
      }),
    );
  }

  /** Resolves free-text lines to catalog rows (plan §6.1); import review and legacy edit use it. */
  async resolve(
    userId: string,
    lines: { rawName: string; unit?: string | undefined }[],
  ): Promise<ResolvedLineDto[]> {
    await this.ensurePrivateTwins(userId);
    const results = await this.resolver.resolveMany(lines, userId);
    return results.map((r) => ({
      rawName: r.rawName,
      unit: r.unit,
      note: r.note,
      confidence: r.confidence,
      match: r.match ? toRef(r.match, userId) : null,
      candidates: r.candidates.map((c) => toRef(c, userId)),
      ...(r.unitProblem ? { unitProblem: r.unitProblem } : {}),
    }));
  }

  /** Full nutrition, portions and density for the rows the user may see (live preview). */
  async getMany(userId: string, ids: string[]): Promise<CatalogIngredientDetail[]> {
    const rows = await this.catalog.findVisibleByIds(ids, userId);
    return rows.map((r) => toDetail(r, userId));
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

  /** The catalog fields a private ingredient takes from a create/update input. */
  private privateData(
    input: (UpdateIngredientInput | CreateCustomIngredientInput) & {
      category?: IngredientCategory | undefined;
      densityGPerMl?: number | null | undefined;
    },
    imageUrl: string | null,
    existing?: CatalogIngredientRow,
  ) {
    return {
      name: titleCase(normalizeIngredientName(input.name)),
      category: input.category ?? existing?.category ?? ('OTHER' as const),
      kcalPer100g: input.caloriesPer100g,
      proteinPer100g: input.proteinPer100g,
      carbsPer100g: input.carbsPer100g,
      fatPer100g: input.fatPer100g,
      fiberPer100g: input.fiberPer100g,
      densityGPerMl:
        input.densityGPerMl !== undefined ? input.densityGPerMl : (existing?.densityGPerMl ?? null),
      imageUrl,
      aliases: [
        ...new Set([
          normalizeIngredientKey(input.name),
          ...(existing?.aliases.map((a) => a.alias) ?? []),
        ]),
      ],
      portions: input.gramsPerPiece ? [{ unit: 'piece', grams: input.gramsPerPiece }] : [],
    };
  }

  /** The user's own private catalog row by id, or NOT_FOUND (another user's row stays hidden). */
  private async ownPrivate(userId: string, id: string): Promise<CatalogIngredientRow> {
    const [row] = await this.catalog.findVisibleByIds([id], userId);
    if (row?.ownerId !== userId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Ingredient not found.' });
    }
    return row;
  }

  /**
   * Updates an editable ingredient.
   * - Global rows (admins): price and image only. Their nutrition comes from
   *   catalog.json through a PR with a source reference (D7), so macro fields
   *   in the input are ignored. `source: 'ADMIN'` keeps the price refresher off.
   * - Private rows (the owner): everything; the legacy price row and the
   *   catalog twin change together, and every recipe of the owner using the
   *   ingredient is recomputed (plan §8.1).
   */
  async update(
    userId: string,
    role: string,
    input: UpdateIngredientInput,
  ): Promise<IngredientListItem> {
    if (input.id) return this.updatePrivateById(userId, input.id, input);
    const row = await this.getEditableRow(userId, role, input.name);
    const isGlobal = row.creatorId === null;

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
        ...(isGlobal
          ? {}
          : {
              caloriesPer100g: input.caloriesPer100g,
              proteinPer100g: input.proteinPer100g,
              carbsPer100g: input.carbsPer100g,
              fatPer100g: input.fatPer100g,
              fiberPer100g: input.fiberPer100g,
              gramsPerPiece: input.gramsPerPiece ?? null,
            }),
        pricePer100gEur: input.pricePer100gEur ?? row.pricePer100gEur,
        pricePer100mlEur: input.pricePer100mlEur ?? row.pricePer100mlEur,
        pricePerPieceEur: input.pricePerPieceEur ?? row.pricePerPieceEur,
        source: isGlobal ? 'ADMIN' : 'USER',
        estimatedAt: new Date(),
      },
    });

    if (!isGlobal) {
      const twin = row.ingredientId
        ? await this.ownPrivate(userId, row.ingredientId).catch(() => null)
        : await this.twinFor(userId, updated);
      if (twin) {
        if (!row.ingredientId)
          await ingredientPriceRepository.linkIngredient(updated.ingredientName, twin.id);
        await this.catalog.updatePrivate(twin.id, userId, this.privateData(input, imageUrl, twin));
        await this.nutrition.recomputeRecipesUsing(twin.id);
      }
    }
    return this.toListItem(updated, userId);
  }

  /** Update of a private catalog row addressed by id (new clients; also rows with no price row). */
  private async updatePrivateById(
    userId: string,
    id: string,
    input: UpdateIngredientInput,
  ): Promise<IngredientListItem> {
    const twin = await this.ownPrivate(userId, id);
    const imageUrl =
      input.imageUrl !== undefined
        ? input.imageUrl
        : input.generateAiImage
          ? ingredientAiImageUrl(input.name)
          : twin.imageUrl;
    const row = await this.catalog.updatePrivate(
      id,
      userId,
      this.privateData(input, imageUrl, twin),
    );
    const legacy = await prisma.ingredientPrice.findFirst({
      where: { ingredientId: id, creatorId: userId },
    });
    if (legacy) {
      await prisma.ingredientPrice.update({
        where: { ingredientName: legacy.ingredientName },
        data: {
          imageUrl,
          caloriesPer100g: input.caloriesPer100g,
          proteinPer100g: input.proteinPer100g,
          carbsPer100g: input.carbsPer100g,
          fatPer100g: input.fatPer100g,
          fiberPer100g: input.fiberPer100g,
          gramsPerPiece: input.gramsPerPiece ?? null,
          estimatedAt: new Date(),
        },
      });
    }
    await this.nutrition.recomputeRecipesUsing(id);
    const piece = row.portions.find((p) => p.unit === 'piece');
    const name = primaryAlias(row);
    return {
      name,
      displayName: row.name,
      imageUrl: row.imageUrl ?? (await resolveIngredientImage(name)),
      caloriesPer100g: row.kcalPer100g,
      proteinPer100g: row.proteinPer100g,
      carbsPer100g: row.carbsPer100g,
      fatPer100g: row.fatPer100g,
      fiberPer100g: row.fiberPer100g,
      gramsPerPiece: piece?.grams ?? null,
      pricePer100gEur: legacy?.pricePer100gEur ?? null,
      pricePer100mlEur: legacy?.pricePer100mlEur ?? null,
      pricePerPieceEur: legacy?.pricePerPieceEur ?? null,
      isCustom: true,
      canEdit: true,
      source: 'USER',
    };
  }

  private async toListItem(row: IngredientPrice, userId: string): Promise<IngredientListItem> {
    return {
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
      canEdit: true,
      source: row.source,
    };
  }

  /**
   * Deletes an editable ingredient: an own custom row, or a global PRICE row
   * as admin (global catalog rows only change through catalog.json, D7). A
   * private catalog row is DEPRECATED rather than deleted, so recipe lines that
   * use it keep their numbers; it no longer appears in search or resolution.
   */
  async delete(
    userId: string,
    role: string,
    name: string,
    id?: string,
  ): Promise<{ success: true }> {
    if (id) {
      await this.ownPrivate(userId, id);
      await this.catalog.deprecatePrivate(id, userId);
      await prisma.ingredientPrice.deleteMany({ where: { ingredientId: id, creatorId: userId } });
      return { success: true };
    }
    const row = await this.getEditableRow(userId, role, name);
    if (row.creatorId === userId && row.ingredientId)
      await this.catalog.deprecatePrivate(row.ingredientId, userId);
    await prisma.ingredientPrice.delete({ where: { ingredientName: row.ingredientName } });
    return { success: true };
  }

  /**
   * Creates a private ingredient (plan §8.1, D5): the five core macros are
   * required, the image is uploaded or AI-generated.
   * - If the catalog already has it (EXACT/ALIAS on a global row), CONFLICT
   *   unless the user confirmed theirs is different (`confirmDifferent`).
   * - Writes the private catalog row (nutritionSource USER) and, while the
   *   name is free in the legacy price vocabulary, its linked price row too, so
   *   pre-catalog consumers (pricing, the Ingredients page) keep seeing it. A
   *   name another row already holds no longer blocks creation (F7).
   */
  async createCustom(
    userId: string,
    input: CreateCustomIngredientInput,
  ): Promise<IngredientSearchResult> {
    const name = normalizeIngredientName(input.name);
    const slug = ingredientSlug(name);
    if (!slug) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Please enter a name.' });

    if (!input.confirmDifferent) {
      const [hit] = await this.resolver.resolveMany([{ rawName: name }], null, {
        candidates: false,
      });
      if (hit?.match) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Chefer already has "${hit.match.name}" — search for it instead.`,
        });
      }
    }

    const imageUrl = input.imageUrl ?? (input.generateAiImage ? ingredientAiImageUrl(name) : null);
    const existing = await this.catalog.findPrivateBySlug(userId, slug);
    const twin = existing
      ? await this.catalog.updatePrivate(
          existing.id,
          userId,
          this.privateData(input, imageUrl, existing),
        )
      : await this.catalog.createPrivate(userId, slug, this.privateData(input, imageUrl));

    const legacy = await prisma.ingredientPrice.findUnique({ where: { ingredientName: name } });
    if (!legacy || legacy.creatorId === userId) {
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
        ingredientId: twin.id,
      };
      await prisma.ingredientPrice.upsert({
        where: { ingredientName: name },
        create: { ingredientName: name, ...fields },
        update: fields,
      });
    }
    if (existing) await this.nutrition.recomputeRecipesUsing(twin.id);

    const lineName = primaryAlias(twin);
    return {
      name: lineName,
      displayName: twin.name,
      imageUrl: twin.imageUrl ?? (await resolveIngredientImage(lineName)),
      hasMacros: true,
      isCustom: true,
      per100g: {
        calories: twin.kcalPer100g,
        protein: twin.proteinPer100g,
        carbs: twin.carbsPer100g,
        fat: twin.fatPer100g,
      },
      ...refFields(twin, userId),
    };
  }

  /**
   * Estimates per-100g nutrition (and typical piece weight / baseline prices)
   * for a single ingredient name, for the "Auto-fill" button on the ingredient
   * form. Catalog rows that already carry macros are returned without an AI
   * call; only genuinely unknown names cost a Gemini request.
   */
  async estimateNutrition(
    user: UserProfile,
    rawName: string,
  ): Promise<{
    caloriesPer100g: number | null;
    proteinPer100g: number | null;
    carbsPer100g: number | null;
    fatPer100g: number | null;
    fiberPer100g: number | null;
    gramsPerPiece: number | null;
    pricePer100gEur: number | null;
    pricePer100mlEur: number | null;
    pricePerPieceEur: number | null;
    source: 'catalog' | 'ai';
  } | null> {
    const userId = user.id;
    const name = normalizeIngredientName(rawName);

    const existing = await prisma.ingredientPrice.findFirst({
      where: {
        ingredientName: name,
        OR: [{ creatorId: null }, { creatorId: userId }],
        caloriesPer100g: { not: null },
      },
    });
    if (existing) {
      return {
        caloriesPer100g: existing.caloriesPer100g,
        proteinPer100g: existing.proteinPer100g,
        carbsPer100g: existing.carbsPer100g,
        fatPer100g: existing.fatPer100g,
        fiberPer100g: existing.fiberPer100g,
        gramsPerPiece: existing.gramsPerPiece,
        pricePer100gEur: existing.pricePer100gEur,
        pricePer100mlEur: existing.pricePer100mlEur,
        pricePerPieceEur: existing.pricePerPieceEur,
        source: 'catalog',
      };
    }

    // Catalog matches stay free; the AI fallback is per-user AI, so it is
    // premium-only and capped (audit F-PAN-2-4). The reservation logs the call.
    const reservation = await reserveNutritionEstimate(user);
    let estimate;
    try {
      const estimates = await aiService.estimateIngredientPrices([name]);
      estimate = estimates[0];
    } catch (err) {
      await reservation.release();
      throw toFriendlyAiError(
        err,
        'estimateIngredientPrices',
        'Could not estimate nutrition right now. Please fill it in manually.',
      );
    }
    if (!estimate) return null;

    return {
      caloriesPer100g: estimate.caloriesPer100g,
      proteinPer100g: estimate.proteinPer100g,
      carbsPer100g: estimate.carbsPer100g,
      fatPer100g: estimate.fatPer100g,
      fiberPer100g: estimate.fiberPer100g,
      gramsPerPiece: estimate.gramsPerPiece,
      pricePer100gEur: estimate.pricePer100gEur,
      pricePer100mlEur: estimate.pricePer100mlEur,
      pricePerPieceEur: estimate.pricePerPieceEur,
      source: 'ai',
    };
  }

  /**
   * Computes per-serving nutrition with the shared engine (plan §5, §9). A line
   * with `ingredientId` uses that row (if the user may see it); a line without
   * one is resolved by name, EXACT/ALIAS only (fuzzy matches are never
   * applied). Lines that cannot be computed are listed in `unmatched` and
   * make the status PARTIAL; nothing is estimated.
   */
  async computeNutrition(
    userId: string,
    ingredients: NutritionComputationLine[],
    servings: number,
  ): Promise<NutritionComputationResult> {
    await this.ensurePrivateTwins(userId);
    const unresolved = ingredients.filter((l) => !l.ingredientId);
    const resolved = await this.resolver.resolveMany(
      unresolved.map((l) => ({ rawName: l.name, unit: l.unit })),
      userId,
      { candidates: false },
    );
    const byLine = new Map(unresolved.map((l, i) => [l, resolved[i]?.match?.id ?? null] as const));
    const lines = ingredients.map((l) => ({
      ingredientId: l.ingredientId ?? byLine.get(l) ?? null,
      rawName: l.name,
      quantity: l.quantity,
      unit: l.unit,
      optional: l.optional,
    }));
    const { result } = await this.nutrition.compute(lines, userId, servings);

    const unmatched = result.lines
      .filter((r) => r.problem)
      .map((r) => ingredients[r.position]?.name ?? '');
    return {
      perServing: result.perServing,
      unmatched,
      matchedCount: ingredients.length - unmatched.length,
      totalCount: ingredients.length,
      status: result.status,
      lines: result.lines.map((r) => ({
        position: r.position,
        name: ingredients[r.position]?.name ?? '',
        ingredientId: lines[r.position]?.ingredientId ?? null,
        grams: r.grams,
        calories: r.facts.calories,
        protein: r.facts.protein,
        ...(r.problem ? { problem: r.problem } : {}),
      })),
    };
  }

  /** Canonical unit list for recipe forms. */
  getUnits(): readonly string[] {
    return RECIPE_UNITS;
  }
}

export const ingredientsService = new IngredientsService();
