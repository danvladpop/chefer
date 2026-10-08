import { describe, expect, it } from 'vitest';
import {
  buildPickerSections,
  filterReplaceCandidates,
  inferMealTypeFromName,
  pickerRowMeta,
  pickerSafetyHeader,
  pickerSafetyHeaderText,
  rankForSlot,
  recipeMealTypeHint,
  slotFitRank,
} from './recipe-picker';

const r = (id: string, isFavourite = false) => ({ id, isFavourite });

describe('buildPickerSections', () => {
  it('puts own recipes and favourites under "Your recipes", the rest under "All recipes"', () => {
    const mine = [r('own-1')];
    const all = [r('cat-1'), r('cat-2', true), r('cat-3')];

    const sections = buildPickerSections(mine, all);

    expect(sections.map((s) => s.title)).toEqual(['Your recipes', 'All recipes']);
    expect(sections[0]?.data.map((x) => x.id)).toEqual(['own-1', 'cat-2']);
    expect(sections[1]?.data.map((x) => x.id)).toEqual(['cat-1', 'cat-3']);
  });

  it('dedupes recipes that are both own and in the catalog list', () => {
    const mine = [r('dup-1')];
    const all = [r('dup-1', true), r('cat-1')];

    const sections = buildPickerSections(mine, all);

    expect(sections[0]?.data.map((x) => x.id)).toEqual(['dup-1']);
    expect(sections[1]?.data.map((x) => x.id)).toEqual(['cat-1']);
  });

  it('omits empty sections', () => {
    expect(buildPickerSections([], [])).toEqual([]);
    expect(buildPickerSections(undefined, [r('cat-1')])).toEqual([
      { title: 'All recipes', data: [r('cat-1')] },
    ]);
    expect(buildPickerSections([r('own-1')], undefined)).toEqual([
      { title: 'Your recipes', data: [r('own-1')] },
    ]);
  });
});

describe('filterReplaceCandidates (T-08.10, bug B-50)', () => {
  const c = (id: string, mealType?: string | null) => ({ id, mealType });

  it('dedupes by id', () => {
    const candidates = [c('a'), c('b'), c('a')];
    expect(filterReplaceCandidates(candidates).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('drops the excluded (currently-replaced) recipe', () => {
    const candidates = [c('a'), c('b'), c('c')];
    expect(filterReplaceCandidates(candidates, { excludeRecipeId: 'b' }).map((x) => x.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('filters by slotType, but lets rows without a mealType through', () => {
    const candidates = [c('a', 'dinner'), c('b', 'snack'), c('c', null), c('d', undefined)];
    expect(filterReplaceCandidates(candidates, { slotType: 'snack' }).map((x) => x.id)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });

  it('combines all three', () => {
    const candidates = [c('a', 'snack'), c('a', 'snack'), c('b', 'dinner'), c('c')];
    expect(
      filterReplaceCandidates(candidates, { slotType: 'snack', excludeRecipeId: 'a' }).map(
        (x) => x.id,
      ),
    ).toEqual(['c']);
  });

  it('is a no-op with no options', () => {
    const candidates = [c('a'), c('b')];
    expect(filterReplaceCandidates(candidates)).toEqual(candidates);
  });
});

describe('slot ranking (UX-PLAN-05)', () => {
  const named = (id: string, name: string, mealType?: string) => ({ id, name, mealType });

  it('guesses a meal type from the name, or nothing', () => {
    expect(inferMealTypeFromName('Blueberry Overnight Oats')).toBe('breakfast');
    expect(inferMealTypeFromName('Chicken Caesar Salad')).toBe('lunch');
    expect(inferMealTypeFromName('Lentil Curry')).toBe('dinner');
    expect(inferMealTypeFromName('Grandma special')).toBeNull();
  });

  it('a known mealType wins over the name guess', () => {
    expect(recipeMealTypeHint({ name: 'Oat cookies', mealType: 'snack' })).toBe('snack');
    expect(recipeMealTypeHint({ name: 'Oat cookies' })).toBe('breakfast');
  });

  it('ranks fits first, unknowns next, other meals last — stably', () => {
    const rows = [
      named('b1', 'Overnight Oats'),
      named('x1', 'Grandma special'),
      named('l1', 'Quinoa Bowl'),
      named('b2', 'Pancakes'),
      named('l2', 'Turkey Wrap'),
    ];
    expect(rankForSlot(rows, 'lunch', recipeMealTypeHint).map((r) => r.id)).toEqual([
      'l1',
      'l2',
      'x1',
      'b1',
      'b2',
    ]);
    expect(rankForSlot(rows, undefined, recipeMealTypeHint).map((r) => r.id)).toEqual(
      rows.map((r) => r.id),
    );
    expect(slotFitRank('lunch', 'lunch')).toBe(0);
    expect(slotFitRank(null, 'lunch')).toBe(1);
    expect(slotFitRank('breakfast', 'lunch')).toBe(2);
  });

  it('buildPickerSections ranks each section for the slot, never drops a row', () => {
    const all = [named('b1', 'Overnight Oats'), named('l1', 'Quinoa Bowl')];
    const sections = buildPickerSections(undefined, all, 'lunch');
    expect(sections[0]?.data.map((x) => x.id)).toEqual(['l1', 'b1']);
  });
});

describe('picker row content (UX-PLAN-05)', () => {
  it('shows kcal · protein · minutes, skipping what is missing', () => {
    expect(
      pickerRowMeta({
        nutritionInfo: { calories: 420.4, protein: 31.6 },
        prepTimeMins: 10,
        cookTimeMins: 15,
      }),
    ).toBe('420 kcal · 32 g protein · 25 min');
    expect(pickerRowMeta({ nutritionInfo: { calories: 300, protein: 0 } })).toBe('300 kcal');
    expect(pickerRowMeta({})).toBe('');
  });

  it('states the shared check once and flags only the rows that passed fewer', () => {
    const header = pickerSafetyHeader([
      { id: 'a', verified: ['peanuts', 'vegan'] },
      { id: 'b', verified: ['peanuts', 'vegan'] },
      { id: 'c', verified: ['peanuts'] },
      { id: 'd', verified: [] },
    ]);
    expect(header.labels).toEqual(['peanuts', 'vegan']);
    expect([...header.partialIds]).toEqual(['c']);
    expect(pickerSafetyHeaderText(header.labels)).toBe('Suggestions checked for peanuts and vegan');
    expect(pickerSafetyHeaderText([])).toBeNull();
  });
});
