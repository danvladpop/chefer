import { describe, expect, it } from 'vitest';
import { catalogRow } from '../../test-support/fake-catalog.js';
import { mappingFor, unitSubstitutes } from './legacy-line-policy.js';

const portion = (unit: string, grams: number) => ({ unit, grams, source: 'fdc-portion:1' });

describe('unitSubstitutes (legacy unit policy)', () => {
  it('reads a size stated in the unit text', () => {
    const milk = catalogRow('m', 'coconut-milk-canned', []);
    expect(unitSubstitutes('can (13.5 oz)', 'can', milk)[0]).toMatchObject({
      unit: 'oz',
      factor: 13.5,
    });
  });

  it('turns a bare count or prep word into a whole-unit portion', () => {
    const avocado = catalogRow('a', 'avocado-raw', [], { portions: [portion('medium', 150)] });
    expect(unitSubstitutes('', 'piece', avocado)[0]?.unit).toBe('medium');
    expect(unitSubstitutes('halved', 'halved', avocado)[0]?.unit).toBe('medium');
  });

  it('maps a size word the row lacks to its piece', () => {
    const egg = catalogRow('e', 'egg-whole-raw', [], { portions: [portion('piece', 50)] });
    expect(unitSubstitutes('large', 'large', egg)[0]).toMatchObject({ unit: 'piece', factor: 1 });
  });

  it('measures zest given in fruit as 1 tbsp per fruit', () => {
    const zest = catalogRow('z', 'lemon-zest', []);
    expect(unitSubstitutes('lemon', 'lemon', zest)[0]).toMatchObject({ unit: 'tbsp', factor: 1 });
    expect(unitSubstitutes('lemon', 'lemon', catalogRow('l', 'lemon-raw', []))).toEqual([]);
  });

  it('never invents a weight for a bare can, scoop, block or inch', () => {
    const row = catalogRow('t', 'tofu-firm', [], { portions: [portion('piece', 100)] });
    for (const u of ['can', 'scoops', 'block', 'inch'])
      expect(unitSubstitutes(u, u, row)).toEqual([]);
  });
});

describe('mappingFor (legacy-mapping.json)', () => {
  it('finds entries by any lookup key of the name', () => {
    expect(mappingFor('Coconut aminos')).toMatchObject({ slug: 'tamari', proxy: true });
    expect(mappingFor('Halloumi cheese, sliced')).toBeDefined();
  });

  it('keeps proxies that would be far off in kcal unresolved', () => {
    for (const name of ['vegan feta', 'cashew cream', 'tahini dressing'])
      expect(mappingFor(name)).toMatchObject({ partial: true });
  });

  it('a split of a measured line adds up to the whole line', () => {
    for (const name of ['mixed berries', 'ginger garlic paste']) {
      const m = mappingFor(name);
      if (!m || !('split' in m)) throw new Error(`${name} is not a split`);
      expect(m.split.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5);
    }
  });

  it('salt and pepper gives each its own full line (both "to taste")', () => {
    const m = mappingFor('salt and pepper');
    expect(m && 'split' in m ? m.split.map((x) => [x.slug, x.share]) : null).toEqual([
      ['salt', 1],
      ['black-pepper', 1],
    ]);
  });
});
