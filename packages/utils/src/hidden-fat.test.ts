import { describe, expect, it } from 'vitest';
import { HIDDEN_FAT_COPY, hiddenFatExtra, withHiddenFat } from './hidden-fat';

describe('hidden fat (lane A3)', () => {
  it('adds a tablespoon of oil for "a little" and 2½ for "a lot"', () => {
    expect(hiddenFatExtra('none')).toEqual({ kcal: 0, fat: 0 });
    expect(hiddenFatExtra('a-little')).toEqual({ kcal: 126, fat: 14 });
    expect(hiddenFatExtra('a-lot')).toEqual({ kcal: 315, fat: 35 });
  });

  it('adds it on top of the estimate, keeping the other numbers', () => {
    expect(withHiddenFat({ kcal: 520, protein: 40, carbs: 50, fat: 15.5 }, 'a-lot')).toEqual({
      kcal: 835,
      protein: 40,
      carbs: 50,
      fat: 50.5,
    });
    expect(withHiddenFat({ kcal: 520, fat: 15 }, 'none')).toEqual({ kcal: 520, fat: 15 });
  });

  it('never exceeds what one entry can hold', () => {
    expect(withHiddenFat({ kcal: 4900, fat: 480 }, 'a-lot')).toEqual({ kcal: 5000, fat: 500 });
  });

  it('says it is an estimate', () => {
    expect(HIDDEN_FAT_COPY.addedLine(126, 14)).toMatch(/estimate/);
  });
});
