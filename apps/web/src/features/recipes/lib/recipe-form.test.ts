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

describe('validateRecipeCore (F-REC-3-7, T-40.6 D-19)', () => {
  it('accepts a complete recipe (0 cook minutes is fine)', () => {
    expect(validateRecipeCore(valid)).toEqual({});
  });

  it('rejects negative and fractional times and servings, once typed', () => {
    const errs = validateRecipeCore({
      ...valid,
      prepTimeMins: '-2',
      cookTimeMins: '2.5',
      servings: '0',
    });
    expect(Object.keys(errs).sort()).toEqual(['cookTimeMins', 'prepTimeMins', 'servings']);
  });

  it('D-19: description, times, servings and steps are all optional — only the name is required', () => {
    expect(
      validateRecipeCore({
        name: 'Pesto',
        description: '',
        prepTimeMins: '',
        cookTimeMins: '',
        servings: '',
        instructions: [''],
      }),
    ).toEqual({});
  });

  it('requires a name', () => {
    const errs = validateRecipeCore({ ...valid, name: ' ' });
    expect(Object.keys(errs).sort()).toEqual(['name']);
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
