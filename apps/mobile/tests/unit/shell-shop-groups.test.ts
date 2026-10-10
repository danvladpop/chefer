import {
  matchesItemSearch,
  shopGroups,
  shopGroupStatus,
  sortCheckedLast,
} from '../../src/features/shell/shop/shop-groups';

// 10 Oct redesign, board "Shop": aisles in the old order with plain names,
// ticked items at the bottom of their aisle (stable otherwise), one field that
// filters by name.

const item = (key: string, category: string, ingredientName = key) => ({
  key,
  category,
  ingredientName,
});

describe('sortCheckedLast', () => {
  it('moves ticked items to the bottom and keeps both parts in order', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((k) => item(k, 'produce'));
    const sorted = sortCheckedLast(items, new Set(['b', 'd']));
    expect(sorted.map((i) => i.key)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('changes nothing when nothing (or everything) is ticked', () => {
    const items = ['a', 'b', 'c'].map((k) => item(k, 'produce'));
    expect(sortCheckedLast(items, new Set()).map((i) => i.key)).toEqual(['a', 'b', 'c']);
    expect(sortCheckedLast(items, new Set(['a', 'b', 'c'])).map((i) => i.key)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not mutate its input', () => {
    const items = ['a', 'b'].map((k) => item(k, 'produce'));
    sortCheckedLast(items, new Set(['a']));
    expect(items.map((i) => i.key)).toEqual(['a', 'b']);
  });
});

describe('matchesItemSearch', () => {
  it('matches any part of the name, ignoring case and spaces around', () => {
    expect(matchesItemSearch('Cherry tomatoes', ' TOM ')).toBe(true);
    expect(matchesItemSearch('Cherry tomatoes', 'garlic')).toBe(false);
    expect(matchesItemSearch('Anything', '')).toBe(true);
  });
});

describe('shopGroups', () => {
  const items = [
    item('milk', 'dairy', 'Milk'),
    item('salmon', 'proteins', 'Salmon fillets'),
    item('spinach', 'produce', 'Spinach'),
    item('lemons', 'produce', 'Lemons'),
    item('rice', 'grains', 'Rice'),
    item('peas', 'frozen', 'Frozen peas'),
    item('foil', 'other', 'Foil'),
    item('mystery', 'snacks', 'Crisps'),
  ];

  it('labels the aisles in the old order', () => {
    expect(shopGroups(items, []).map((g) => g.label)).toEqual([
      'Fruit & veg',
      'Meat & fish',
      'Dairy & eggs',
      'Grains & pantry',
      'Frozen',
      'Other',
    ]);
  });

  it('puts an unknown category under Other instead of dropping it', () => {
    const other = shopGroups(items, []).find((g) => g.category === 'other');
    expect(other?.items.map((i) => i.key)).toEqual(['foil', 'mystery']);
  });

  it('sinks ticked items within their aisle and counts what is left', () => {
    const produce = shopGroups(items, ['spinach']).find((g) => g.category === 'produce');
    expect(produce?.items.map((i) => i.key)).toEqual(['lemons', 'spinach']);
    expect(produce && shopGroupStatus(produce)).toBe('1 of 2 left');
  });

  it('says All done when an aisle is ticked off', () => {
    const dairy = shopGroups(items, ['milk']).find((g) => g.category === 'dairy');
    expect(dairy && shopGroupStatus(dairy)).toBe('All done');
  });

  it('a search keeps only matching rows and aisles', () => {
    const groups = shopGroups(items, [], 'lem');
    expect(groups.map((g) => g.category)).toEqual(['produce']);
    expect(groups[0]?.items.map((i) => i.key)).toEqual(['lemons']);
    // The header still counts the whole aisle.
    expect(groups[0]?.total).toBe(2);
  });
});
