import {
  applyResolution,
  linesForPreview,
  lineState,
  linesToPayload,
  prefillLines,
  type CatalogFormLine,
} from '../../src/features/ingredients/catalog-line';

// plan-ingredient-catalog §10 (P9): the recipe form's line model, pure.

const garlic = {
  id: 'garlic-id',
  slug: 'garlic-raw',
  name: 'Garlic, raw',
  category: 'VEGETABLE' as const,
  owner: 'global' as const,
  portions: [{ unit: 'clove', grams: 3 }],
  hasDensity: true,
  nutritionSource: 'USDA_FDC' as const,
};

function line(over: Partial<CatalogFormLine>): CatalogFormLine {
  return { key: 'k', name: '', quantity: '', unit: 'g', ...over };
}

describe('lineState', () => {
  it('ignores a blank line, asks for a match, a unit, then an amount', () => {
    expect(lineState(line({}), undefined)).toBe('empty');
    expect(lineState(line({ name: 'garlic', quantity: '2' }), undefined)).toBe('needsMatch');
    expect(
      lineState(
        line({ name: 'Garlic', ingredientId: 'garlic-id', quantity: '2', unit: 'medium' }),
        garlic,
      ),
    ).toBe('needsUnit');
    expect(
      lineState(line({ name: 'Garlic', ingredientId: 'garlic-id', unit: 'clove' }), garlic),
    ).toBe('needsQuantity');
    expect(
      lineState(
        line({ name: 'Garlic', ingredientId: 'garlic-id', quantity: '½', unit: 'cloves' }),
        garlic,
      ),
    ).toBe('ok');
  });

  it('trusts the unit while the row is still loading (the server decides)', () => {
    expect(
      lineState(line({ name: 'x', ingredientId: 'x', quantity: '1', unit: 'medium' }), undefined),
    ).toBe('ok');
  });
});

describe('linesToPayload / linesForPreview', () => {
  it('sends only linked lines with an amount, round-tripping note and optional', () => {
    const lines = [
      line({
        name: 'Garlic, raw',
        ingredientId: 'garlic-id',
        quantity: '2',
        unit: 'clove',
        note: 'minced',
      }),
      line({ name: 'parsley', quantity: '1', unit: 'g' }),
      line({
        name: 'Lemon',
        ingredientId: 'lemon-id',
        quantity: '1',
        unit: 'piece',
        optional: true,
      }),
    ];
    expect(linesToPayload(lines)).toEqual([
      {
        name: 'Garlic, raw',
        quantity: 2,
        unit: 'clove',
        ingredientId: 'garlic-id',
        note: 'minced',
      },
      { name: 'Lemon', quantity: 1, unit: 'piece', ingredientId: 'lemon-id', optional: true },
    ]);
    expect(linesForPreview(lines)).toEqual([
      { ingredientId: 'garlic-id', quantity: 2, unit: 'clove' },
      { ingredientId: null, quantity: 1, unit: 'g' },
      { ingredientId: 'lemon-id', quantity: 1, unit: 'piece', optional: true },
    ]);
  });
});

describe('prefillLines / applyResolution', () => {
  it('stored lines come back linked with their canonical unit; others wait for the resolver', () => {
    const lines = prefillLines(
      [
        { name: 'garlic', quantity: 2, unit: 'cloves, minced' },
        { name: 'mystery', quantity: 1, unit: 'tsp' },
      ],
      [
        {
          position: 0,
          ingredientId: 'garlic-id',
          rawName: 'garlic',
          quantity: 2,
          unit: 'clove',
          grams: 6,
          note: 'minced',
          optional: false,
        },
        {
          position: 1,
          ingredientId: null,
          rawName: 'mystery',
          quantity: 1,
          unit: 'tsp',
          grams: null,
          note: null,
          optional: false,
        },
      ],
    );
    expect(lines[0]).toMatchObject({
      ingredientId: 'garlic-id',
      unit: 'clove',
      note: 'minced',
      linked: true,
    });
    expect(lines[1]).toMatchObject({ resolving: true, name: 'mystery' });
    expect(lines[1]?.ingredientId).toBeUndefined();
  });

  it('a recipe from before the catalog (no stored lines) resolves every line', () => {
    const lines = prefillLines([{ name: 'garlic', quantity: 2, unit: 'cloves' }], []);
    expect(lines[0]?.resolving).toBe(true);
  });

  it('EXACT/ALIAS links; CANDIDATES keeps the text and offers suggestions, never auto-applied', () => {
    const waiting = [
      line({ name: 'garlic', rawName: 'garlic', quantity: '2', unit: 'cloves', resolving: true }),
      line({ name: 'spice', rawName: 'spice', quantity: '1', unit: 'tsp', resolving: true }),
    ];
    const next = applyResolution(waiting, [
      {
        rawName: 'garlic',
        unit: 'clove',
        note: null,
        confidence: 'ALIAS',
        match: garlic,
        candidates: [],
      },
      {
        rawName: 'spice',
        unit: 'tsp',
        note: null,
        confidence: 'CANDIDATES',
        match: null,
        candidates: [garlic],
      },
    ]);
    expect(next[0]).toMatchObject({ ingredientId: 'garlic-id', unit: 'clove', resolving: false });
    expect(next[1]?.ingredientId).toBeUndefined();
    expect(next[1]?.candidates).toEqual([garlic]);
  });
});
