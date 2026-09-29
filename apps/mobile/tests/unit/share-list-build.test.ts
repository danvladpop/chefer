import {
  buildShopShareText,
  shareCounts,
  toShareItems,
} from '../../src/features/shopping-list/share-list-build';

// T-13.2 — the glue between the Shop screen's data and the shared formatter.

const items = [
  { key: 'a', ingredientName: 'Chicken breast', category: 'proteins', quantity: 500, unit: 'g' },
  { key: 'b', ingredientName: 'Spinach', category: 'produce', quantity: 200, unit: 'g' },
  { key: 'c', ingredientName: 'Tomatoes', category: 'produce', quantity: 4, unit: '' },
  {
    key: 'd',
    ingredientName: 'Rice',
    category: 'grains',
    quantity: 1,
    unit: 'kg',
    pantryCovered: true,
  },
  {
    key: 'e',
    ingredientName: 'Birthday candles',
    category: 'other',
    quantity: 1,
    unit: '',
    isCustom: true,
  },
];

// 2026-09-28 is a Monday.
const weekStart = new Date(2026, 8, 28);

describe('toShareItems', () => {
  it('orders by the list aisle order, keeps item order, and maps ticks/pantry/custom', () => {
    const out = toShareItems(items, ['b']);
    expect(out.map((i) => i.name)).toEqual([
      'Spinach',
      'Tomatoes',
      'Chicken breast',
      'Rice',
      'Birthday candles',
    ]);
    expect(out[0]).toMatchObject({ aisle: 'produce', checked: true, haveIt: false });
    expect(out[3]).toMatchObject({ aisle: 'grains', haveIt: true });
    expect(out[4]).toMatchObject({ aisle: 'other', isCustom: true });
  });

  it('files an unknown aisle under Other', () => {
    const out = toShareItems(
      items.slice(0, 1).map((i) => ({ ...i, category: 'mystery' })),
      [],
    );
    expect(out[0]?.aisle).toBe('other');
  });
});

describe('shareCounts', () => {
  it('whatsLeft drops ticked and pantry-covered lines', () => {
    expect(shareCounts(toShareItems(items, ['b']))).toEqual({ everything: 5, whatsLeft: 3 });
  });
  it('nothing ticked and nothing covered: both scopes match', () => {
    expect(
      shareCounts(
        toShareItems(
          items.filter((i) => !i.pantryCovered),
          [],
        ),
      ),
    ).toEqual({
      everything: 4,
      whatsLeft: 4,
    });
  });
});

describe('buildShopShareText', () => {
  const base = {
    items,
    checkedKeys: ['b'],
    weekStart,
    fromDayOfWeek: undefined,
    portions: null,
    scope: 'whatsLeft' as const,
    withAmounts: true,
    withDinners: false,
    dinners: [],
    unitSystem: 'METRIC' as const,
    shareUrl: 'https://chefer.example/',
  };

  it("builds What's left with title, aisle labels, amounts and the footer", () => {
    const text = buildShopShareText(base);
    expect(text).toBe(
      [
        'Shopping list · 28 Sep – 4 Oct',
        'PRODUCE\n- Tomatoes, 4',
        'PROTEINS\n- Chicken breast, 500 g',
        'OTHER\n- Birthday candles, 1',
        'Made with Chefer · https://chefer.example/',
      ].join('\n\n'),
    );
  });

  it('Everything marks pantry lines, no amounts drops quantities, dinners are appended', () => {
    const text = buildShopShareText({
      ...base,
      scope: 'everything',
      withAmounts: false,
      withDinners: true,
      dinners: [{ dayLabel: 'Mon', recipeName: 'Chicken Stir-fry' }],
      portions: 2,
    });
    expect(text).toContain('For 1 dinner · 2 portions');
    expect(text).toContain('GRAINS & PANTRY\n- Rice (have it)');
    expect(text).toContain('- Spinach\n');
    expect(text).toContain('Mon: Chicken Stir-fry');
    expect(text).not.toMatch(/500 g/);
  });
});
