// Test support: an in-memory ingredient catalog that honours ownership the way
// IngredientRepository does (global rows + the caller's own private rows,
// ACTIVE-only for lookups), so resolver/service tests assert behaviour.
import type {
  CatalogIngredientRow,
  IIngredientRepository,
  IngredientKeyMatch,
  PrivateIngredientData,
} from '@chefer/database';

export function catalogRow(
  id: string,
  slug: string,
  aliases: string[],
  over: Partial<CatalogIngredientRow> = {},
): CatalogIngredientRow {
  return {
    id,
    slug,
    name: slug,
    category: 'OTHER',
    status: 'ACTIVE',
    ownerId: null,
    kcalPer100g: 100,
    proteinPer100g: 1,
    carbsPer100g: 1,
    fatPer100g: 1,
    fiberPer100g: 0,
    sugarPer100g: null,
    satFatPer100g: null,
    sodiumMgPer100g: null,
    densityGPerMl: null,
    edibleFraction: 1,
    nutritionSource: 'USDA_FDC',
    sourceRef: 'fdc:1',
    imageUrl: null,
    portions: [],
    aliases: aliases.map((alias) => ({ alias, locale: 'en' })),
    ...over,
  };
}

export interface FakeCatalog extends IIngredientRepository {
  rows: CatalogIngredientRow[];
}

/** `fuzzy`: base key → ids returned as trigram candidates. */
export function fakeCatalog(
  initial: CatalogIngredientRow[],
  fuzzy: Record<string, string[]> = {},
): FakeCatalog {
  const rows = [...initial];
  let seq = 0;
  const visible = (r: CatalogIngredientRow, owner: string | null) =>
    r.ownerId === null || r.ownerId === owner;
  const fromData = (
    id: string,
    ownerId: string,
    slug: string,
    d: PrivateIngredientData,
  ): CatalogIngredientRow =>
    catalogRow(id, slug, [], {
      ownerId,
      name: d.name,
      category: d.category,
      kcalPer100g: d.kcalPer100g,
      proteinPer100g: d.proteinPer100g,
      carbsPer100g: d.carbsPer100g,
      fatPer100g: d.fatPer100g,
      fiberPer100g: d.fiberPer100g,
      densityGPerMl: d.densityGPerMl ?? null,
      imageUrl: d.imageUrl ?? null,
      nutritionSource: 'USER',
      sourceRef: null,
      aliases: [...new Set(d.aliases)].map((alias) => ({ alias, locale: 'en' })),
      portions: d.portions.map((p) => ({ ...p, source: 'user' })),
    });

  return {
    rows,
    findVisibleByIds: (ids, owner) =>
      Promise.resolve(rows.filter((r) => ids.includes(r.id) && visible(r, owner))),
    findKeyMatches: (keys, owner) => {
      const out: IngredientKeyMatch[] = [];
      for (const r of rows) {
        if (!visible(r, owner) || r.status !== 'ACTIVE') continue;
        const slugKey = r.slug.replace(/-/g, ' ');
        if (r.ownerId === null && keys.includes(slugKey))
          out.push({ key: slugKey, ingredientId: r.id, via: 'slug', ownerId: null });
        for (const a of r.aliases)
          if (keys.includes(a.alias))
            out.push({ key: a.alias, ingredientId: r.id, via: 'alias', ownerId: r.ownerId });
      }
      return Promise.resolve(out);
    },
    fuzzyCandidates: (key, owner) =>
      Promise.resolve(
        (fuzzy[key] ?? [])
          .filter((id) => rows.some((r) => r.id === id && visible(r, owner)))
          .map((ingredientId, i) => ({ ingredientId, score: 0.9 - i / 10 })),
      ),
    searchByAlias: (key, owner, opts) =>
      Promise.resolve(
        rows
          .filter(
            (r) =>
              visible(r, owner) &&
              r.status === 'ACTIVE' &&
              (!opts.category || r.category === opts.category),
          )
          .flatMap((r) =>
            r.aliases
              .filter((a) => a.alias.includes(key))
              .map((a) => ({ alias: a.alias, ingredient: r })),
          )
          .slice(0, opts.limit),
      ),
    findGlobalIdsBySlugs: (slugs) =>
      Promise.resolve(
        new Map(
          rows
            .filter((r) => r.ownerId === null && slugs.includes(r.slug))
            .map((r) => [r.slug, r.id]),
        ),
      ),
    findPrivateBySlug: (owner, slug) =>
      Promise.resolve(rows.find((r) => r.ownerId === owner && r.slug === slug) ?? null),
    createPrivate: (owner, slug, d) => {
      const row = fromData(`p${++seq}`, owner, slug, d);
      rows.push(row);
      return Promise.resolve(row);
    },
    updatePrivate: (id, owner, d) => {
      const i = rows.findIndex((r) => r.id === id && r.ownerId === owner);
      if (i < 0) return Promise.reject(new Error('not found'));
      const slug = rows[i]?.slug ?? '';
      const row = fromData(id, owner, slug, d);
      rows[i] = row;
      return Promise.resolve(row);
    },
    listVisible: (owner, opts) => {
      const hits = rows
        .filter(
          (r) =>
            r.status === 'ACTIVE' &&
            (opts.mineOnly ? r.ownerId === owner : visible(r, owner)) &&
            (!opts.category || r.category === opts.category) &&
            (!opts.key && !opts.text
              ? true
              : (opts.key !== undefined &&
                  r.aliases.some((a) => a.alias.includes(opts.key ?? ''))) ||
                (opts.text !== undefined &&
                  r.name.toLowerCase().includes((opts.text ?? '').toLowerCase()))),
        )
        .sort(
          (a, b) =>
            Number(b.ownerId !== null) - Number(a.ownerId !== null) || a.name.localeCompare(b.name),
        );
      const page = hits.slice(opts.offset, opts.offset + opts.limit);
      return Promise.resolve({ rows: page, hasMore: hits.length > opts.offset + opts.limit });
    },
    deprecatePrivate: (id, owner) => {
      const r = rows.find((x) => x.id === id && x.ownerId === owner);
      if (r) {
        r.status = 'DEPRECATED';
        r.aliases = [];
      }
      return Promise.resolve();
    },
  };
}
