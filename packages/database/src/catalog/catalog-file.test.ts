import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeIssues, validateCatalog, type CatalogEntry } from './validate';

// Gate on the committed catalog (plan-ingredient-catalog §4.5, I5): every
// global row must pass the validators before it can reach the database.
const CATALOG_PATH = join(__dirname, '../../data/ingredients/catalog.json');
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as CatalogEntry[];

describe('data/ingredients/catalog.json', () => {
  it('passes the validators with zero errors', () => {
    const issues = validateCatalog(catalog);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors, JSON.stringify(errors.slice(0, 5))).toEqual([]);
    expect(summarizeIssues(issues).errors).toBe(0);
  });

  it('is sorted by slug with unique slugs, for clean diffs and a stable sync', () => {
    const slugs = catalog.map((e) => e.slug);
    expect(slugs).toEqual([...slugs].sort());
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has a source reference on every row', () => {
    expect(catalog.filter((e) => !/^(fdc|ciqual|label):.+/.test(e.sourceRef))).toEqual([]);
  });

  it('weighs a can at 400 g net, 240 g for drained rows, never for fish or meat (owner, 2026-10-02)', () => {
    const can = (slug: string) =>
      catalog.find((e) => e.slug === slug)?.portions.find((p) => p.unit === 'can')?.grams;
    expect(can('tomatoes-canned')).toBe(400);
    expect(can('coconut-milk-canned')).toBe(400);
    expect(can('chickpeas-canned-drained')).toBe(240);
    expect(can('tuna-canned-water')).toBeUndefined();
    expect(can('sardines-canned-oil')).toBeUndefined();
    const cans = catalog.flatMap((e) => e.portions.filter((p) => p.unit === 'can'));
    expect(cans.length).toBeGreaterThan(20);
    expect(cans.every((p) => p.grams === 400 || p.grams === 240)).toBe(true);
  });
});
