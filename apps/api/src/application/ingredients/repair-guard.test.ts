import { describe, expect, it, vi } from 'vitest';
import { repairRejection } from './repair-guard.js';

vi.mock('@chefer/database', () => ({ readCatalogFile: () => [] }));

const row = (slug: string, name: string, aliases: string[] = []) => ({ slug, name, aliases });
const BROCCOLI = row('broccoli-raw', 'Broccoli, raw', ['broccoli']);
const PASTA = row('pasta-dry', 'Pasta, dry', ['pasta', 'spaghetti']);
const OIL = row('olive-oil', 'Olive oil', ['olive oil']);

describe('repairRejection', () => {
  it('accepts a real conversion of a known food', () => {
    expect(
      repairRejection(
        { rawName: 'Broccoli', quantity: 1, unit: 'head', slug: 'broccoli-raw', candidates: [] },
        { slug: 'broccoli-raw', quantity: 600, unit: 'g' },
        BROCCOLI,
      ),
    ).toBeNull();
  });

  it('refuses a copied count, but allows grams ↔ ml with the same number', () => {
    expect(
      repairRejection(
        { rawName: 'Broccoli', quantity: 1, unit: 'head', slug: 'broccoli-raw', candidates: [] },
        { slug: 'broccoli-raw', quantity: 1, unit: 'g' },
        BROCCOLI,
      ),
    ).toMatch(/copied the count/);
    expect(
      repairRejection(
        { rawName: 'olive oil', quantity: 15, unit: 'ml', candidates: [] },
        { slug: 'olive-oil', quantity: 15, unit: 'g' },
        OIL,
      ),
    ).toBeNull();
  });

  it('refuses look-alike foods and changes of a known food; accepts a candidate', () => {
    expect(
      repairRejection(
        { rawName: 'Red curry paste', quantity: 2, unit: 'tbsp', candidates: [] },
        { slug: 'pasta-dry', quantity: 30, unit: 'g' },
        PASTA,
      ),
    ).toMatch(/does not match/);
    expect(
      repairRejection(
        { rawName: 'Broccoli', quantity: 1, unit: 'head', slug: 'broccoli-raw', candidates: [] },
        { slug: 'pasta-dry', quantity: 600, unit: 'g' },
        PASTA,
      ),
    ).toMatch(/changed a known food/);
    expect(
      repairRejection(
        { rawName: 'Collagen', quantity: 2, unit: 'scoop', candidates: ['pasta-dry'] },
        { slug: 'pasta-dry', quantity: 20, unit: 'g' },
        PASTA,
      ),
    ).toBeNull();
  });

  it('refuses unknown slugs and absurd amounts', () => {
    expect(
      repairRejection(
        { rawName: 'x', quantity: 1, unit: 'g', candidates: [] },
        { slug: 'nope', quantity: 5, unit: 'g' },
        undefined,
      ),
    ).toMatch(/unknown slug/);
    expect(
      repairRejection(
        { rawName: 'Broccoli', quantity: 1, unit: 'head', slug: 'broccoli-raw', candidates: [] },
        { slug: 'broccoli-raw', quantity: 5000, unit: 'g' },
        BROCCOLI,
      ),
    ).toMatch(/implausible amount/);
  });
});
