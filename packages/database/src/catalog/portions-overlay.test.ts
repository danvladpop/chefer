import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCatalogFile, readGeneratedCatalogFile } from './catalog-file';
import {
  applyPortionsOverlay,
  readPortionsOverlay,
  validatePortionsOverlay,
  type PortionsOverlayRow,
} from './portions-overlay';
import { validateCatalog, type CatalogEntry } from './validate';

function fail(message: string): never {
  throw new Error(message);
}

const generated = readGeneratedCatalogFile();
const overlay = readPortionsOverlay();

describe('data/ingredients/portions-overlay.json', () => {
  it('has rows, and every row is sourced, in grams, and for a slug that exists', () => {
    expect(overlay.length).toBeGreaterThan(20);
    expect(validatePortionsOverlay(overlay, generated)).toEqual([]);
    for (const row of overlay) {
      expect(row.source, `${row.slug}/${row.unit}`).toMatch(
        /^(fdc-portion:\d+|ciqual:\d+|ref:\S.*)$/,
      );
      expect(row.grams).toBeGreaterThan(0);
      expect(row.note.trim()).not.toBe('');
    }
  });

  it('never re-types a number: every basedOn row equals the generated portion it re-labels', () => {
    const based = overlay.filter((r) => r.basedOn !== undefined);
    expect(based.length).toBe(overlay.length);
    for (const row of based) {
      const base = generated
        .find((e) => e.slug === row.slug)
        ?.portions.find((p) => p.unit === row.basedOn);
      expect({ g: base?.grams, s: base?.source }).toEqual({ g: row.grams, s: row.source });
    }
  });

  it('covers the units imports hit: garlic, onion, tomato, potato, carrot, banana, apple, egg, chicken breast', () => {
    const merged = readCatalogFile();
    const piece = (slug: string) =>
      merged.find((e) => e.slug === slug)?.portions.find((p) => p.unit === 'piece')?.grams;
    expect(piece('garlic-raw')).toBe(3);
    for (const slug of [
      'onion-raw',
      'tomato-raw',
      'potato-raw',
      'carrot-raw',
      'banana-raw',
      'apple-raw',
      'egg-boiled',
      'chicken-breast-raw',
    ])
      expect(piece(slug), slug).toBeGreaterThan(0);
  });

  it('keeps the merged catalog valid with zero errors and adds only piece portions', () => {
    const merged = readCatalogFile();
    expect(validateCatalog(merged).filter((i) => i.severity === 'error')).toEqual([]);
    expect(merged.map((e) => e.slug)).toEqual(generated.map((e) => e.slug));
    const added = merged.flatMap((e, i) =>
      e.portions.filter((p) => !generated[i]?.portions.some((q) => q.unit === p.unit)),
    );
    expect(added.length).toBe(overlay.length);
    expect(added.every((p) => p.unit === 'piece')).toBe(true);
  });
});

describe('validatePortionsOverlay', () => {
  const entry = (portions: CatalogEntry['portions']): CatalogEntry => ({
    slug: 'garlic-raw',
    name: 'Garlic, raw',
    category: 'VEGETABLE',
    aliases: [{ alias: 'garlic', locale: 'en' }],
    kcalPer100g: 149,
    proteinPer100g: 6.4,
    carbsPer100g: 28.2,
    fatPer100g: 0.5,
    fiberPer100g: 2.1,
    nutritionSource: 'USDA_FDC',
    sourceRef: 'fdc:1',
    portions,
  });
  const clove = { unit: 'clove', grams: 3, source: 'fdc-portion:84480' };
  const row: PortionsOverlayRow = {
    ...clove,
    slug: 'garlic-raw',
    unit: 'piece',
    basedOn: 'clove',
    note: 'One clove.',
  };

  it('accepts a sourced row', () => {
    expect(validatePortionsOverlay([row], [entry([clove])])).toEqual([]);
  });

  it('rejects an unsourced row, bad grams, an unknown slug and a unit the row already has', () => {
    expect(validatePortionsOverlay([{ ...row, source: '' }], [entry([clove])])).not.toEqual([]);
    expect(validatePortionsOverlay([{ ...row, source: 'trust-me' }], [entry([clove])])).not.toEqual(
      [],
    );
    expect(validatePortionsOverlay([{ ...row, grams: 0 }], [entry([clove])])).not.toEqual([]);
    expect(validatePortionsOverlay([{ ...row, slug: 'nope' }], [entry([clove])])).not.toEqual([]);
    expect(
      validatePortionsOverlay([row], [entry([clove, { ...clove, unit: 'piece' }])]),
    ).not.toEqual([]);
  });

  it('rejects a basedOn row whose number differs from the portion it re-labels', () => {
    expect(validatePortionsOverlay([{ ...row, grams: 5 }], [entry([clove])])).not.toEqual([]);
  });
});

describe('applyPortionsOverlay', () => {
  it('appends portions without mutating, and never overrides a generated unit', () => {
    const base: CatalogEntry = {
      ...(generated.find((e) => e.slug === 'garlic-raw') ?? fail('garlic-raw missing')),
      slug: 'x',
      portions: [{ unit: 'piece', grams: 10, source: 'fdc-portion:1' }],
    };
    const rows: PortionsOverlayRow[] = [
      { slug: 'x', unit: 'piece', grams: 99, source: 'fdc-portion:2', note: 'n' },
      { slug: 'x', unit: 'clove', grams: 3, source: 'fdc-portion:3', note: 'n' },
      { slug: 'missing', unit: 'clove', grams: 3, source: 'fdc-portion:3', note: 'n' },
    ];
    const out = applyPortionsOverlay([base], rows);
    expect(out[0]?.portions.map((p) => `${p.unit}:${p.grams}`)).toEqual(['piece:10', 'clove:3']);
    expect(base.portions).toHaveLength(1);
  });

  it('readCatalogFile skips the overlay for a custom path unless one is given', () => {
    const path = join(__dirname, '../../data/ingredients/catalog.json');
    const plain = readCatalogFile(path, null);
    const garlic = (es: CatalogEntry[]) => es.find((e) => e.slug === 'garlic-raw');
    expect(garlic(plain)?.portions.some((p) => p.unit === 'piece')).toBe(false);
    expect(garlic(readCatalogFile())?.portions.some((p) => p.unit === 'piece')).toBe(true);
  });
});
