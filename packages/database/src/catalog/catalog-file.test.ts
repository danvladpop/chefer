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
});
