import { describe, expect, it } from 'vitest';
import { buildPickerSections, filterReplaceCandidates } from './recipe-picker';

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
