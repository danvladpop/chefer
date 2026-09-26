import { describe, expect, it } from 'vitest';
import { firstInvalidTarget, validateRecipeCore } from './recipe-form';

const valid = {
  name: 'Pesto',
  description: 'Green',
  prepTimeMins: '10',
  cookTimeMins: '0',
  servings: '2',
  instructions: ['', 'Blend.'],
};

describe('validateRecipeCore (F-REC-3-7)', () => {
  it('accepts a complete recipe (0 cook minutes is fine)', () => {
    expect(validateRecipeCore(valid)).toEqual({});
  });

  it('rejects negative, fractional and blank times and servings', () => {
    const errs = validateRecipeCore({
      ...valid,
      prepTimeMins: '-2',
      cookTimeMins: '2.5',
      servings: '0',
    });
    expect(Object.keys(errs).sort()).toEqual(['cookTimeMins', 'prepTimeMins', 'servings']);
    expect(validateRecipeCore({ ...valid, prepTimeMins: ' ' }).prepTimeMins).toBeTruthy();
  });

  it('requires a name, description and one non-blank step', () => {
    const errs = validateRecipeCore({ ...valid, name: ' ', description: '', instructions: [' '] });
    expect(Object.keys(errs).sort()).toEqual(['description', 'instructions', 'name']);
  });
});

describe('firstInvalidTarget', () => {
  it('picks the first error in page order, not object-key order', () => {
    expect(
      firstInvalidTarget(
        { calories: 'x', servings: 'y', description: 'z' },
        { calories: 'cal', servings: 'srv', description: 'desc' },
      ),
    ).toBe('desc');
  });

  it('skips errors without a focus target and returns null when nothing is invalid', () => {
    expect(firstInvalidTarget({ name: 'x', servings: 'y' }, { servings: 'srv' })).toBe('srv');
    expect(firstInvalidTarget({}, { name: 'n' })).toBeNull();
  });
});
