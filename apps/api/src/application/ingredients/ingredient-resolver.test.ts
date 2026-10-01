import { describe, expect, it, vi } from 'vitest';
import { catalogRow, fakeCatalog } from '../../test-support/fake-catalog.js';
import { IngredientResolver, toNutritionIngredient } from './ingredient-resolver.js';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, prisma: {} };
});

const row = catalogRow;

const TOMATO = row('t', 'tomato-raw', ['tomato'], {
  portions: [{ unit: 'medium', grams: 123, source: 'fdc-portion:1' }],
});
const CHERRY = row('c', 'tomato-cherry-raw', ['cherry tomato']);
const OLIVE_OIL = row('o', 'olive-oil', ['olive oil', 'ulei de masline'], { densityGPerMl: 0.913 });
const TAHINI = row('g', 'tahini', ['tahini']);
const MY_TAHINI = row('m', 'tahini', ['tahini', 'my tahini'], {
  ownerId: 'alice',
  nutritionSource: 'USER',
});
const BOBS_SECRET = row('b', 'bob-sauce', ['secret sauce'], {
  ownerId: 'bob',
  nutritionSource: 'USER',
});
const ALL = [TOMATO, CHERRY, OLIVE_OIL, TAHINI, MY_TAHINI, BOBS_SECRET];

const fakeRepo = (fuzzy: Record<string, string[]> = {}) => fakeCatalog(ALL, fuzzy);

describe('IngredientResolver', () => {
  it('EXACT on a slug, ALIAS on an alias, from the most specific key', async () => {
    const r = new IngredientResolver(fakeRepo());
    const [slug, alias, cherry] = await r.resolveMany(
      [
        { rawName: 'Olive oil', unit: 'tbsp' },
        { rawName: 'Ulei de măsline', unit: 'ml' },
        { rawName: 'Cherry tomatoes, halved', unit: 'g' },
      ],
      'alice',
    );
    expect(slug).toMatchObject({ confidence: 'EXACT', matchedKey: 'olive oil', unit: 'tbsp' });
    expect(slug?.match?.id).toBe('o');
    expect(alias).toMatchObject({ confidence: 'ALIAS', matchedKey: 'ulei de masline' });
    // "cherry tomato" must win over the less specific "tomato"
    expect(cherry?.match?.id).toBe('c');
  });

  it('prefers the global row over the owner’s private row for the same key (§6.1 order)', async () => {
    const r = new IngredientResolver(fakeRepo());
    const [tahini, mine] = await r.resolveMany(
      [{ rawName: 'tahini' }, { rawName: 'My tahini' }],
      'alice',
    );
    expect(tahini?.match?.id).toBe('g');
    expect(mine).toMatchObject({ confidence: 'ALIAS' });
    expect(mine?.match?.id).toBe('m');
  });

  it("never resolves to, or suggests, another user's private row (I4)", async () => {
    const r = new IngredientResolver(fakeRepo({ 'secret sauce': ['b'] }));
    const [asAlice] = await r.resolveMany([{ rawName: 'secret sauce' }], 'alice');
    expect(asAlice).toMatchObject({ confidence: 'NONE', match: null, candidates: [] });
    const [asBob] = await r.resolveMany([{ rawName: 'secret sauce' }], 'bob');
    expect(asBob?.match?.id).toBe('b');
    const [globalOnly] = await r.resolveMany([{ rawName: 'My tahini' }], null);
    expect(globalOnly?.match).toBeNull();
  });

  it('returns fuzzy CANDIDATES on a miss, without applying them', async () => {
    const r = new IngredientResolver(fakeRepo({ tomatoe: ['t', 'c'] }));
    const [res] = await r.resolveMany([{ rawName: 'tomatoe' }], 'alice');
    expect(res).toMatchObject({ confidence: 'CANDIDATES', match: null });
    expect(res?.candidates.map((c) => c.id)).toEqual(['t', 'c']);
  });

  it('skips the fuzzy query when candidates are off', async () => {
    const repo = fakeRepo({ tomatoe: ['t'] });
    const spy = vi.spyOn(repo, 'fuzzyCandidates');
    const [res] = await new IngredientResolver(repo).resolveMany(
      [{ rawName: 'tomatoe' }],
      'alice',
      {
        candidates: false,
      },
    );
    expect(res?.confidence).toBe('NONE');
    expect(spy).not.toHaveBeenCalled();
  });

  it('normalizes the unit, splits prep text, and flags units the match cannot convert', async () => {
    const r = new IngredientResolver(fakeRepo());
    const [medium, cup, clove] = await r.resolveMany(
      [
        { rawName: 'tomatoes', unit: 'medium, diced' },
        { rawName: 'tomato', unit: 'cup' },
        { rawName: 'olive oil', unit: 'cloves' },
      ],
      'alice',
    );
    expect(medium).toMatchObject({ unit: 'medium', note: 'diced' });
    expect(medium?.unitProblem).toBeUndefined();
    expect(cup?.unitProblem).toBe('NO_DENSITY');
    expect(clove?.unitProblem).toBe('NO_PORTION');
  });

  it('maps a row to the engine shape', () => {
    expect(toNutritionIngredient(OLIVE_OIL)).toMatchObject({
      id: 'o',
      densityGPerMl: 0.913,
      edibleFraction: 1,
      portions: [],
    });
  });
});
