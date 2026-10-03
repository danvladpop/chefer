import type { IngredientCategory, NutritionSource, Prisma } from '@prisma/client';
import { prisma } from '../client';

// ─── Ingredient catalog reads + private-ingredient writes (plan §6, §8, §9) ───
// Every read is scoped to what `ownerId` may see: global rows (ownerId null)
// plus that user's own private rows. Another user's private row is never
// returned (invariant I4). Global rows are written only by the catalog sync.

export interface CatalogIngredientRow {
  id: string;
  slug: string;
  name: string;
  category: IngredientCategory;
  status: 'ACTIVE' | 'MERGED' | 'DEPRECATED';
  ownerId: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g: number | null;
  satFatPer100g: number | null;
  sodiumMgPer100g: number | null;
  densityGPerMl: number | null;
  edibleFraction: number;
  nutritionSource: NutritionSource;
  sourceRef: string | null;
  imageUrl: string | null;
  portions: { unit: string; grams: number; source: string }[];
  aliases: { alias: string; locale: string }[];
}

/** One lookup key that hit an ACTIVE row the owner may see. */
export interface IngredientKeyMatch {
  key: string;
  ingredientId: string;
  /** `slug`: the key is the row's slug as words; `alias`: an alias row. */
  via: 'slug' | 'alias';
  /** null for a global row. */
  ownerId: string | null;
}

export interface PrivateIngredientData {
  name: string;
  category: IngredientCategory;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g?: number | null;
  satFatPer100g?: number | null;
  sodiumMgPer100g?: number | null;
  densityGPerMl?: number | null;
  imageUrl?: string | null;
  /** Normalized lookup keys (the name's key at least). */
  aliases: string[];
  portions: { unit: string; grams: number }[];
}

export interface IIngredientRepository {
  /** Rows by id that `ownerId` may see, in any status (lines can point at a DEPRECATED row). */
  findVisibleByIds(ids: string[], ownerId: string | null): Promise<CatalogIngredientRow[]>;
  /** ACTIVE rows hit by any of `keys`: global slugs, global aliases, the owner's aliases. */
  findKeyMatches(keys: string[], ownerId: string | null): Promise<IngredientKeyMatch[]>;
  /**
   * Trigram-similar ACTIVE rows for one key (pg_trgm), best first. Suggestions
   * only: never applied on write. Empty when pg_trgm is unavailable.
   */
  fuzzyCandidates(
    key: string,
    ownerId: string | null,
    limit: number,
  ): Promise<{ ingredientId: string; score: number }[]>;
  /**
   * ACTIVE rows with an alias containing `key` (picker search); at most `limit` alias hits.
   * `uses` (UX-FOOD-12 commonness) is how many recipe lines point at the row.
   */
  searchByAlias(
    key: string,
    ownerId: string,
    opts: { category?: IngredientCategory | undefined; limit: number },
  ): Promise<{ alias: string; ingredient: CatalogIngredientRow; uses?: number }[]>;
  /** The owner's private row with this slug, if any (any status). */
  findPrivateBySlug(ownerId: string, slug: string): Promise<CatalogIngredientRow | null>;
  /** slug → id of the GLOBAL rows with these slugs (any status). */
  findGlobalIdsBySlugs(slugs: string[]): Promise<Map<string, string>>;
  /** Creates a private ingredient with its aliases and portions (nutritionSource USER). */
  createPrivate(
    ownerId: string,
    slug: string,
    data: PrivateIngredientData,
  ): Promise<CatalogIngredientRow>;
  /** Replaces a private ingredient's nutrition, aliases and portions. */
  updatePrivate(
    id: string,
    ownerId: string,
    data: PrivateIngredientData,
  ): Promise<CatalogIngredientRow>;
  /** Marks a private ingredient DEPRECATED (its recipe lines keep pointing at it). */
  deprecatePrivate(id: string, ownerId: string): Promise<void>;
  /**
   * Weekly review (plan §8.2): ACTIVE private rows created or edited since
   * `since`, or used by a recipe saved since then, with their recipe count.
   */
  findPrivateForReview(since: Date): Promise<PrivateReviewRow[]>;
  /** Rows by id regardless of owner or status (review tooling only). */
  findForReview(ids: string[]): Promise<PrivateReviewRow[]>;
  /**
   * Weekly review merge: the private row becomes MERGED into `intoId`; its
   * owner aliases and linked price rows move to that row, so the owner's
   * free text keeps resolving (to the global row now). One transaction.
   */
  markMerged(id: string, intoId: string): Promise<void>;
  /**
   * One page of the ACTIVE rows `ownerId` may see, for the Ingredients page
   * (plan §10): the owner's private rows first, then globals, by name.
   * `key` (a normalized lookup key) matches any visible alias; `text` matches
   * the display name, case-insensitive.
   */
  listVisible(ownerId: string, opts: CatalogListQuery): Promise<CatalogListPage>;
}

export interface CatalogListQuery {
  key?: string | undefined;
  text?: string | undefined;
  category?: IngredientCategory | undefined;
  /** Only the owner's private rows. */
  mineOnly?: boolean | undefined;
  limit: number;
  offset: number;
}

export interface CatalogListPage {
  rows: CatalogIngredientRow[];
  hasMore: boolean;
}

/** The where-clause of `listVisible`, exported for its unit test. */
export function catalogListWhere(
  ownerId: string,
  opts: Omit<CatalogListQuery, 'limit' | 'offset'>,
): Prisma.IngredientWhereInput {
  const search: Prisma.IngredientWhereInput[] = [];
  if (opts.key) {
    search.push({
      aliases: {
        some: { alias: { contains: opts.key }, OR: [{ ownerId: null }, { ownerId }] },
      },
    });
  }
  if (opts.text) search.push({ name: { contains: opts.text, mode: 'insensitive' } });
  return {
    status: 'ACTIVE',
    ...(opts.mineOnly ? { ownerId } : visibleTo(ownerId)),
    ...(opts.category ? { category: opts.category } : {}),
    ...(search.length > 0 ? { AND: [{ OR: search }] } : {}),
  };
}

export type PrivateReviewRow = CatalogIngredientRow & {
  mergedIntoId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Distinct recipes with a line on this row. */
  recipeCount: number;
};

const INCLUDE = {
  portions: { select: { unit: true, grams: true, source: true }, orderBy: { unit: 'asc' } },
  aliases: { select: { alias: true, locale: true }, orderBy: { alias: 'asc' } },
} satisfies Prisma.IngredientInclude;

function visibleTo(ownerId: string | null): Prisma.IngredientWhereInput {
  return ownerId ? { OR: [{ ownerId: null }, { ownerId }] } : { ownerId: null };
}

function privateColumns(data: PrivateIngredientData) {
  return {
    name: data.name,
    category: data.category,
    kcalPer100g: data.kcalPer100g,
    proteinPer100g: data.proteinPer100g,
    carbsPer100g: data.carbsPer100g,
    fatPer100g: data.fatPer100g,
    fiberPer100g: data.fiberPer100g,
    sugarPer100g: data.sugarPer100g ?? null,
    satFatPer100g: data.satFatPer100g ?? null,
    sodiumMgPer100g: data.sodiumMgPer100g ?? null,
    densityGPerMl: data.densityGPerMl ?? null,
    imageUrl: data.imageUrl ?? null,
  };
}

export class IngredientRepository implements IIngredientRepository {
  async findVisibleByIds(ids: string[], ownerId: string | null): Promise<CatalogIngredientRow[]> {
    if (ids.length === 0) return [];
    return prisma.ingredient.findMany({
      where: { id: { in: [...new Set(ids)] }, ...visibleTo(ownerId) },
      include: INCLUDE,
    });
  }

  async findKeyMatches(keys: string[], ownerId: string | null): Promise<IngredientKeyMatch[]> {
    const unique = [...new Set(keys)].filter((k) => k.length > 0);
    if (unique.length === 0) return [];
    const slugs = unique.map((k) => k.replace(/ /g, '-'));
    const [bySlug, byAlias] = await Promise.all([
      prisma.ingredient.findMany({
        where: { ownerId: null, status: 'ACTIVE', slug: { in: slugs } },
        select: { id: true, slug: true },
      }),
      prisma.ingredientAlias.findMany({
        where: {
          alias: { in: unique },
          ...(ownerId ? { OR: [{ ownerId: null }, { ownerId }] } : { ownerId: null }),
          ingredient: { status: 'ACTIVE', ...visibleTo(ownerId) },
        },
        select: { alias: true, ingredientId: true, ownerId: true },
      }),
    ]);
    return [
      ...bySlug.map((r) => ({
        key: r.slug.replace(/-/g, ' '),
        ingredientId: r.id,
        via: 'slug' as const,
        ownerId: null,
      })),
      ...byAlias.map((a) => ({
        key: a.alias,
        ingredientId: a.ingredientId,
        via: 'alias' as const,
        ownerId: a.ownerId,
      })),
    ];
  }

  async fuzzyCandidates(
    key: string,
    ownerId: string | null,
    limit: number,
  ): Promise<{ ingredientId: string; score: number }[]> {
    if (!key) return [];
    try {
      // The one raw query in the catalog code: Prisma has no trigram operator
      // (plan §6.1). Parameters are bound by the tagged template.
      const rows = await prisma.$queryRaw<{ ingredientId: string; score: number }[]>`
        SELECT a."ingredientId" AS "ingredientId", MAX(similarity(a.alias, ${key}))::float8 AS score
        FROM ingredient_aliases a
        JOIN ingredients i ON i.id = a."ingredientId"
        WHERE i.status = 'ACTIVE'
          AND (i."ownerId" IS NULL OR i."ownerId" = ${ownerId})
          AND (a."ownerId" IS NULL OR a."ownerId" = ${ownerId})
          AND similarity(a.alias, ${key}) > 0.25
        GROUP BY a."ingredientId"
        ORDER BY score DESC
        LIMIT ${limit}`;
      return rows;
    } catch (err) {
      console.warn('[ingredients] trigram candidates unavailable (pg_trgm missing?):', err);
      return [];
    }
  }

  async searchByAlias(
    key: string,
    ownerId: string,
    opts: { category?: IngredientCategory | undefined; limit: number },
  ): Promise<{ alias: string; ingredient: CatalogIngredientRow; uses?: number }[]> {
    if (!key) return [];
    const where = (alias: Prisma.StringFilter): Prisma.IngredientAliasWhereInput => ({
      alias,
      OR: [{ ownerId: null }, { ownerId }],
      ingredient: {
        status: 'ACTIVE',
        OR: [{ ownerId: null }, { ownerId }],
        ...(opts.category ? { category: opts.category } : {}),
      },
    });
    const select = { alias: true, ingredient: { include: INCLUDE } } as const;
    // Prefix hits are fetched on their own so an alphabetical cut-off of the
    // substring hits can never drop them.
    const [prefix, contains] = await Promise.all([
      prisma.ingredientAlias.findMany({
        where: where({ startsWith: key }),
        select,
        orderBy: { alias: 'asc' },
        take: opts.limit,
      }),
      prisma.ingredientAlias.findMany({
        where: where({ contains: key }),
        select,
        orderBy: { alias: 'asc' },
        take: opts.limit,
      }),
    ]);
    const seen = new Set<string>();
    const hits = [...prefix, ...contains].filter((h) => {
      const k = `${h.ingredient.id}\u0000${h.alias}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
    // Commonness (UX-FOOD-12): how many recipe lines use each row, so "chicken
    // breast" outranks "chicken fat" once both match the name equally well.
    const ids = [...new Set(hits.map((h) => h.ingredient.id))];
    const usage =
      ids.length > 0
        ? await prisma.recipeIngredient.groupBy({
            by: ['ingredientId'],
            where: { ingredientId: { in: ids } },
            _count: { _all: true },
          })
        : [];
    const uses = new Map(usage.map((u) => [u.ingredientId, u._count._all]));
    return hits.map((h) => ({ ...h, uses: uses.get(h.ingredient.id) ?? 0 }));
  }

  async findGlobalIdsBySlugs(slugs: string[]): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const rows = await prisma.ingredient.findMany({
      where: { ownerId: null, slug: { in: [...new Set(slugs)] } },
      select: { id: true, slug: true },
    });
    return new Map(rows.map((r) => [r.slug, r.id]));
  }

  async findPrivateBySlug(ownerId: string, slug: string): Promise<CatalogIngredientRow | null> {
    return prisma.ingredient.findFirst({ where: { ownerId, slug }, include: INCLUDE });
  }

  async createPrivate(
    ownerId: string,
    slug: string,
    data: PrivateIngredientData,
  ): Promise<CatalogIngredientRow> {
    return prisma.ingredient.create({
      data: {
        ...privateColumns(data),
        slug,
        ownerId,
        status: 'ACTIVE',
        nutritionSource: 'USER',
        aliases: {
          create: [...new Set(data.aliases)].map((alias) => ({ alias, ownerId, locale: 'en' })),
        },
        portions: {
          create: data.portions.map((p) => ({ unit: p.unit, grams: p.grams, source: 'user' })),
        },
      },
      include: INCLUDE,
    });
  }

  async updatePrivate(
    id: string,
    ownerId: string,
    data: PrivateIngredientData,
  ): Promise<CatalogIngredientRow> {
    return prisma.$transaction(async (tx) => {
      const row = await tx.ingredient.findFirst({ where: { id, ownerId }, select: { id: true } });
      if (!row) throw new Error(`private ingredient ${id} not found for owner`);
      await tx.ingredientAlias.deleteMany({ where: { ingredientId: id } });
      await tx.ingredientPortion.deleteMany({ where: { ingredientId: id } });
      return tx.ingredient.update({
        where: { id },
        data: {
          ...privateColumns(data),
          status: 'ACTIVE',
          aliases: {
            create: [...new Set(data.aliases)].map((alias) => ({ alias, ownerId, locale: 'en' })),
          },
          portions: {
            create: data.portions.map((p) => ({ unit: p.unit, grams: p.grams, source: 'user' })),
          },
        },
        include: INCLUDE,
      });
    });
  }

  async listVisible(ownerId: string, opts: CatalogListQuery): Promise<CatalogListPage> {
    const rows = await prisma.ingredient.findMany({
      where: catalogListWhere(ownerId, opts),
      include: INCLUDE,
      // Private rows (ownerId set) before globals (null), then by name.
      orderBy: [{ ownerId: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
      skip: opts.offset,
      take: opts.limit + 1, // one extra row to detect hasMore
    });
    return { rows: rows.slice(0, opts.limit), hasMore: rows.length > opts.limit };
  }

  async deprecatePrivate(id: string, ownerId: string): Promise<void> {
    await prisma.$transaction([
      prisma.ingredientAlias.deleteMany({ where: { ingredientId: id, ownerId } }),
      prisma.ingredient.updateMany({ where: { id, ownerId }, data: { status: 'DEPRECATED' } }),
    ]);
  }

  async findPrivateForReview(since: Date): Promise<PrivateReviewRow[]> {
    return this.reviewRows({
      ownerId: { not: null },
      status: 'ACTIVE',
      OR: [
        { createdAt: { gte: since } },
        { updatedAt: { gte: since } },
        { lines: { some: { recipe: { nutritionComputedAt: { gte: since } } } } },
      ],
    });
  }

  async findForReview(ids: string[]): Promise<PrivateReviewRow[]> {
    if (ids.length === 0) return [];
    return this.reviewRows({ id: { in: [...new Set(ids)] } });
  }

  private async reviewRows(where: Prisma.IngredientWhereInput): Promise<PrivateReviewRow[]> {
    const rows = await prisma.ingredient.findMany({
      where,
      include: { ...INCLUDE, lines: { select: { recipeId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ lines, ...row }) => ({
      ...row,
      recipeCount: new Set(lines.map((l) => l.recipeId)).size,
    }));
  }

  async markMerged(id: string, intoId: string): Promise<void> {
    await prisma.$transaction([
      prisma.ingredientAlias.updateMany({
        where: { ingredientId: id, ownerId: { not: null } },
        data: { ingredientId: intoId },
      }),
      prisma.ingredientPrice.updateMany({
        where: { ingredientId: id },
        data: { ingredientId: intoId },
      }),
      prisma.ingredient.update({
        where: { id },
        data: { status: 'MERGED', mergedIntoId: intoId },
      }),
    ]);
  }
}

export const ingredientRepository = new IngredientRepository();
