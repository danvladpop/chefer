/**
 * Catalog sync — docs/plan-ingredient-catalog.md §4.4 step 7 (D7).
 *
 * `data/ingredients/catalog.json` is the source of truth for GLOBAL ingredient
 * rows (ownerId null). The sync makes the database match it, by slug:
 *   - a new slug is created; a changed row is updated; an unchanged row is left
 *     alone, so a second run is a no-op;
 *   - global aliases and portions are made to match the file exactly;
 *   - a slug that left the file becomes DEPRECATED when anything still points at
 *     it (a recipe line, a price row, a merged private row), and is deleted
 *     otherwise. A DEPRECATED slug that comes back is ACTIVE again.
 * It never touches private rows, and never writes `imageUrl` (admins own it).
 *
 * `planCatalogSync` is pure (tested without a database); `applyCatalogSync`
 * validates, loads the current globals, plans, and writes the plan in ONE
 * transaction. Global slug and alias uniqueness is enforced here and in the
 * validators, because Postgres treats NULL ownerIds as distinct (§3 note).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  summarizeIssues,
  validateCatalog,
  type CatalogEntry,
  type ValidationIssue,
} from './validate';

/** Scalar columns the catalog owns on a global Ingredient row. */
const SCALAR_FIELDS = [
  'name',
  'category',
  'kcalPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
  'fiberPer100g',
  'sugarPer100g',
  'satFatPer100g',
  'sodiumMgPer100g',
  'densityGPerMl',
  'edibleFraction',
  'nutritionSource',
  'sourceRef',
  'sourceNote',
] as const;
type ScalarField = (typeof SCALAR_FIELDS)[number];
type Scalars = Record<ScalarField, string | number | null>;

/** A global ingredient as currently stored, with what the sync compares. */
export interface DbGlobalIngredient extends Scalars {
  id: string;
  slug: string;
  status: 'ACTIVE' | 'MERGED' | 'DEPRECATED';
  aliases: { id: string; alias: string; locale: string }[];
  portions: { id: string; unit: string; grams: number; source: string }[];
  /** Any recipe line, price row or merged private row points at it. */
  referenced: boolean;
}

export interface CatalogSyncPlan {
  create: CatalogEntry[];
  update: { id: string; slug: string; changed: string[]; data: Prisma.IngredientUpdateInput }[];
  unchanged: number;
  deprecate: { id: string; slug: string }[];
  remove: { id: string; slug: string }[];
  aliases: {
    create: { slug: string; alias: string; locale: string }[];
    deleteIds: string[];
  };
  portions: {
    create: { slug: string; unit: string; grams: number; source: string }[];
    update: { id: string; grams: number; source: string }[];
    deleteIds: string[];
  };
}

/** The scalar values a catalog entry should have in the database. */
export function entryScalars(e: CatalogEntry): Scalars {
  return {
    name: e.name,
    category: e.category,
    kcalPer100g: e.kcalPer100g,
    proteinPer100g: e.proteinPer100g,
    carbsPer100g: e.carbsPer100g,
    fatPer100g: e.fatPer100g,
    fiberPer100g: e.fiberPer100g,
    sugarPer100g: e.sugarPer100g ?? null,
    satFatPer100g: e.satFatPer100g ?? null,
    sodiumMgPer100g: e.sodiumMgPer100g ?? null,
    densityGPerMl: e.densityGPerMl ?? null,
    edibleFraction: e.edibleFraction ?? 1,
    nutritionSource: e.nutritionSource,
    sourceRef: e.sourceRef,
    sourceNote: e.sourceNote ?? null,
  };
}

/** One alias per string per row (the first locale wins), in file order. */
function uniqueAliases(e: CatalogEntry): { alias: string; locale: string }[] {
  const seen = new Set<string>();
  return e.aliases.filter((a) => (seen.has(a.alias) ? false : (seen.add(a.alias), true)));
}

/**
 * Plans the writes that make the stored globals match `entries`. Pure.
 * Assumes `entries` already passed `validateCatalog` (unique slugs/aliases).
 */
export function planCatalogSync(
  entries: readonly CatalogEntry[],
  db: readonly DbGlobalIngredient[],
): CatalogSyncPlan {
  const plan: CatalogSyncPlan = {
    create: [],
    update: [],
    unchanged: 0,
    deprecate: [],
    remove: [],
    aliases: { create: [], deleteIds: [] },
    portions: { create: [], update: [], deleteIds: [] },
  };
  const bySlug = new Map(db.map((row) => [row.slug, row]));
  const inFile = new Set(entries.map((e) => e.slug));

  for (const e of entries) {
    const row = bySlug.get(e.slug);
    const wantAliases = uniqueAliases(e);
    if (!row) {
      plan.create.push(e);
      for (const a of wantAliases) plan.aliases.create.push({ slug: e.slug, ...a });
      for (const p of e.portions) plan.portions.create.push({ slug: e.slug, ...p });
      continue;
    }

    const want = entryScalars(e);
    const changed = SCALAR_FIELDS.filter((f) => want[f] !== row[f]);
    const data: Record<string, unknown> = Object.fromEntries(changed.map((f) => [f, want[f]]));
    if (row.status !== 'ACTIVE') {
      changed.push('status' as ScalarField);
      data['status'] = 'ACTIVE';
    }
    if (changed.length > 0) {
      plan.update.push({
        id: row.id,
        slug: e.slug,
        changed,
        data,
      });
    } else plan.unchanged += 1;

    const keep = new Set(wantAliases.map((a) => `${a.alias}\u0000${a.locale}`));
    const have = new Set(row.aliases.map((a) => `${a.alias}\u0000${a.locale}`));
    for (const a of row.aliases)
      if (!keep.has(`${a.alias}\u0000${a.locale}`)) plan.aliases.deleteIds.push(a.id);
    for (const a of wantAliases)
      if (!have.has(`${a.alias}\u0000${a.locale}`))
        plan.aliases.create.push({ slug: e.slug, ...a });

    const portionByUnit = new Map(row.portions.map((p) => [p.unit, p]));
    const wantUnits = new Set(e.portions.map((p) => p.unit));
    for (const p of row.portions) if (!wantUnits.has(p.unit)) plan.portions.deleteIds.push(p.id);
    for (const p of e.portions) {
      const cur = portionByUnit.get(p.unit);
      if (!cur) plan.portions.create.push({ slug: e.slug, ...p });
      else if (cur.grams !== p.grams || cur.source !== p.source)
        plan.portions.update.push({ id: cur.id, grams: p.grams, source: p.source });
    }
  }

  for (const row of db) {
    if (inFile.has(row.slug)) continue;
    if (row.referenced) {
      // A deprecated row no longer resolves, so its aliases go; its portions stay
      // so the lines that still point at it can be recomputed.
      if (row.status !== 'DEPRECATED') plan.deprecate.push({ id: row.id, slug: row.slug });
      for (const a of row.aliases) plan.aliases.deleteIds.push(a.id);
    } else plan.remove.push({ id: row.id, slug: row.slug });
  }
  return plan;
}

export interface CatalogSyncReport {
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  deprecated: string[];
  removed: string[];
  aliases: { created: number; deleted: number };
  portions: { created: number; updated: number; deleted: number };
  warnings: number;
}

export class CatalogValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(
      `catalog has ${issues.length} validator error(s); first: ${issues
        .slice(0, 3)
        .map((i) => `${i.slug} ${i.rule}: ${i.message}`)
        .join(' | ')}`,
    );
    this.name = 'CatalogValidationError';
  }
}

/** Loads every global ingredient with its aliases, portions and reference flag. */
export async function loadGlobalIngredients(
  db: Prisma.TransactionClient | PrismaClient,
): Promise<DbGlobalIngredient[]> {
  const rows = await db.ingredient.findMany({
    where: { ownerId: null },
    include: {
      aliases: { where: { ownerId: null }, select: { id: true, alias: true, locale: true } },
      portions: { select: { id: true, unit: true, grams: true, source: true } },
      _count: { select: { lines: true, prices: true, mergedFrom: true } },
    },
  });
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.slug))
      throw new Error(`database has two global ingredients with slug "${r.slug}"`);
    seen.add(r.slug);
  }
  return rows.map(({ _count, ...r }) => ({
    ...r,
    referenced: _count.lines + _count.prices + _count.mergedFrom > 0,
  }));
}

function toCreateRow(e: CatalogEntry): Prisma.IngredientCreateManyInput {
  const s = entryScalars(e);
  return {
    ...(s as Omit<Prisma.IngredientCreateManyInput, 'slug'>),
    slug: e.slug,
    ownerId: null,
    status: 'ACTIVE',
  };
}

/**
 * Validates `entries` (any validator error aborts before a single write), then
 * makes the global rows match them in one transaction. `dryRun` plans only.
 */
export async function applyCatalogSync(
  prisma: PrismaClient,
  entries: readonly CatalogEntry[],
  opts: { dryRun?: boolean } = {},
): Promise<CatalogSyncReport> {
  const issues = validateCatalog(entries);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new CatalogValidationError(errors);

  const run = async (tx: Prisma.TransactionClient): Promise<CatalogSyncReport> => {
    const plan = planCatalogSync(entries, await loadGlobalIngredients(tx));
    const report: CatalogSyncReport = {
      dryRun: opts.dryRun === true,
      rows: entries.length,
      created: plan.create.length,
      updated: plan.update.length,
      unchanged: plan.unchanged,
      deprecated: plan.deprecate.map((r) => r.slug),
      removed: plan.remove.map((r) => r.slug),
      aliases: { created: plan.aliases.create.length, deleted: plan.aliases.deleteIds.length },
      portions: {
        created: plan.portions.create.length,
        updated: plan.portions.update.length,
        deleted: plan.portions.deleteIds.length,
      },
      warnings: summarizeIssues(issues).warnings,
    };
    if (opts.dryRun) return report;

    // Deletes first, so an alias can move between rows within one sync.
    if (plan.aliases.deleteIds.length > 0)
      await tx.ingredientAlias.deleteMany({ where: { id: { in: plan.aliases.deleteIds } } });
    if (plan.portions.deleteIds.length > 0)
      await tx.ingredientPortion.deleteMany({ where: { id: { in: plan.portions.deleteIds } } });
    if (plan.remove.length > 0)
      await tx.ingredient.deleteMany({ where: { id: { in: plan.remove.map((r) => r.id) } } });
    if (plan.deprecate.length > 0)
      await tx.ingredient.updateMany({
        where: { id: { in: plan.deprecate.map((r) => r.id) } },
        data: { status: 'DEPRECATED' },
      });

    if (plan.create.length > 0)
      await tx.ingredient.createMany({ data: plan.create.map(toCreateRow) });
    for (const u of plan.update) await tx.ingredient.update({ where: { id: u.id }, data: u.data });
    for (const p of plan.portions.update)
      await tx.ingredientPortion.update({
        where: { id: p.id },
        data: { grams: p.grams, source: p.source },
      });

    if (plan.aliases.create.length > 0 || plan.portions.create.length > 0) {
      const ids = new Map(
        (
          await tx.ingredient.findMany({
            where: { ownerId: null },
            select: { id: true, slug: true },
          })
        ).map((r) => [r.slug, r.id]),
      );
      const idOf = (slug: string): string => {
        const id = ids.get(slug);
        if (!id) throw new Error(`sync: no id for slug "${slug}"`);
        return id;
      };
      if (plan.aliases.create.length > 0)
        await tx.ingredientAlias.createMany({
          data: plan.aliases.create.map((a) => ({
            ingredientId: idOf(a.slug),
            alias: a.alias,
            locale: a.locale,
            ownerId: null,
          })),
        });
      if (plan.portions.create.length > 0)
        await tx.ingredientPortion.createMany({
          data: plan.portions.create.map((p) => ({
            ingredientId: idOf(p.slug),
            unit: p.unit,
            grams: p.grams,
            source: p.source,
          })),
        });
    }
    return report;
  };

  // pg_trgm backs the resolver's fuzzy candidates (§6.1). Creating it here keeps
  // it migration-free; a missing privilege only delays fuzzy search, so it warns.
  if (!opts.dryRun) {
    try {
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    } catch (err) {
      console.warn('[catalog-sync] could not create extension pg_trgm:', err);
    }
  }
  return prisma.$transaction(run, { maxWait: 10_000, timeout: 120_000 });
}
