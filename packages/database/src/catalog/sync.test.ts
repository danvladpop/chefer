import { describe, expect, it } from 'vitest';
import { entryScalars, planCatalogSync, type DbGlobalIngredient } from './sync';
import type { CatalogEntry } from './validate';

function entry(slug: string, over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug,
    name: slug,
    category: 'OTHER',
    aliases: [{ alias: slug.replace(/-/g, ' '), locale: 'en' }],
    kcalPer100g: 100,
    proteinPer100g: 5,
    carbsPer100g: 10,
    fatPer100g: 4,
    fiberPer100g: 1,
    nutritionSource: 'USDA_FDC',
    sourceRef: `fdc:${slug.length}`,
    portions: [{ unit: 'piece', grams: 50, source: 'fdc-portion:1' }],
    ...over,
  };
}

/** The stored row that exactly matches `e`. */
function stored(e: CatalogEntry, over: Partial<DbGlobalIngredient> = {}): DbGlobalIngredient {
  return {
    id: `id-${e.slug}`,
    slug: e.slug,
    status: 'ACTIVE',
    ...entryScalars(e),
    aliases: e.aliases.map((a, i) => ({ id: `al-${e.slug}-${i}`, ...a })),
    portions: e.portions.map((p, i) => ({ id: `po-${e.slug}-${i}`, ...p })),
    referenced: false,
    ...over,
  };
}

describe('planCatalogSync', () => {
  it('creates every row, alias and portion into an empty database', () => {
    const plan = planCatalogSync([entry('egg'), entry('milk')], []);
    expect(plan.create.map((e) => e.slug)).toEqual(['egg', 'milk']);
    expect(plan.aliases.create).toEqual([
      { slug: 'egg', alias: 'egg', locale: 'en' },
      { slug: 'milk', alias: 'milk', locale: 'en' },
    ]);
    expect(plan.portions.create).toHaveLength(2);
  });

  it('is a no-op when the database already matches (idempotent)', () => {
    const file = [entry('egg', { sugarPer100g: 0.4, densityGPerMl: 1.03 }), entry('milk')];
    const plan = planCatalogSync(
      file,
      file.map((e) => stored(e)),
    );
    expect(plan).toEqual({
      create: [],
      update: [],
      unchanged: 2,
      deprecate: [],
      remove: [],
      aliases: { create: [], deleteIds: [] },
      portions: { create: [], update: [], deleteIds: [] },
    });
  });

  it('updates only the changed columns, defaulting optional ones (edibleFraction 1, nulls)', () => {
    const before = entry('egg', { sourceNote: 'old' });
    const after = entry('egg', { kcalPer100g: 143 });
    const plan = planCatalogSync([after], [stored(before)]);
    expect(plan.update).toEqual([
      {
        id: 'id-egg',
        slug: 'egg',
        changed: ['kcalPer100g', 'sourceNote'],
        data: { kcalPer100g: 143, sourceNote: null },
      },
    ]);
  });

  it('reactivates a deprecated slug that is back in the file', () => {
    const e = entry('egg');
    const plan = planCatalogSync([e], [stored(e, { status: 'DEPRECATED' })]);
    expect(plan.update[0]?.data).toEqual({ status: 'ACTIVE' });
  });

  it('makes aliases match the file, so an alias can move between rows', () => {
    const egg = entry('egg', { aliases: [{ alias: 'egg', locale: 'en' }] });
    const eggWhole = entry('egg-whole', {
      aliases: [
        { alias: 'whole egg', locale: 'en' },
        { alias: 'ou', locale: 'ro' },
      ],
    });
    const db = [
      stored(egg, {
        aliases: [
          { id: 'a1', alias: 'egg', locale: 'en' },
          { id: 'a2', alias: 'ou', locale: 'ro' },
        ],
      }),
      stored(eggWhole, { aliases: [{ id: 'a3', alias: 'whole egg', locale: 'en' }] }),
    ];
    const plan = planCatalogSync([egg, eggWhole], db);
    expect(plan.aliases.deleteIds).toEqual(['a2']);
    expect(plan.aliases.create).toEqual([{ slug: 'egg-whole', alias: 'ou', locale: 'ro' }]);
  });

  it('collapses a duplicated alias within one row to its first locale', () => {
    const e = entry('feta', {
      aliases: [
        { alias: 'feta', locale: 'en' },
        { alias: 'feta', locale: 'ro' },
      ],
    });
    expect(planCatalogSync([e], []).aliases.create).toEqual([
      { slug: 'feta', alias: 'feta', locale: 'en' },
    ]);
  });

  it('creates, updates and deletes portions by unit', () => {
    const before = entry('egg', {
      portions: [
        { unit: 'large', grams: 50, source: 'fdc-portion:1' },
        { unit: 'can', grams: 822, source: 'fdc-portion:2' },
      ],
    });
    const after = entry('egg', {
      portions: [
        { unit: 'large', grams: 50.3, source: 'fdc-portion:1' },
        { unit: 'medium', grams: 44, source: 'fdc-portion:3' },
      ],
    });
    const plan = planCatalogSync([after], [stored(before)]);
    expect(plan.portions.update).toEqual([
      { id: 'po-egg-0', grams: 50.3, source: 'fdc-portion:1' },
    ]);
    expect(plan.portions.deleteIds).toEqual(['po-egg-1']);
    expect(plan.portions.create).toEqual([
      { slug: 'egg', unit: 'medium', grams: 44, source: 'fdc-portion:3' },
    ]);
  });

  it('deprecates a removed slug that is still referenced (dropping its aliases) and deletes an unreferenced one', () => {
    const kept = entry('egg');
    const used = entry('lard-fdc');
    const unused = entry('tallow');
    const plan = planCatalogSync(
      [kept],
      [stored(kept), stored(used, { referenced: true }), stored(unused)],
    );
    expect(plan.deprecate).toEqual([{ id: 'id-lard-fdc', slug: 'lard-fdc' }]);
    expect(plan.remove).toEqual([{ id: 'id-tallow', slug: 'tallow' }]);
    expect(plan.aliases.deleteIds).toEqual(['al-lard-fdc-0']);
    expect(plan.portions.deleteIds).toEqual([]);
  });

  it('does not re-deprecate a row that is already deprecated', () => {
    const used = entry('lard-fdc');
    const plan = planCatalogSync(
      [],
      [stored(used, { referenced: true, status: 'DEPRECATED', aliases: [] })],
    );
    expect(plan.deprecate).toEqual([]);
    expect(plan.remove).toEqual([]);
  });
});
