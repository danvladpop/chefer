import { describe, expect, it } from 'vitest';
import {
  EAT_OUT_CUISINE_LABELS,
  EAT_OUT_CUISINES,
  EAT_OUT_SIZES,
  eatOutEstimate,
  eatOutEstimates,
  eatOutLogValues,
  eatOutMealName,
  formatEatOutKcal,
  formatEatOutProtein,
} from './eat-out';

describe('eatOutEstimates', () => {
  it('covers every cuisine at every size', () => {
    expect(EAT_OUT_CUISINES).toEqual([
      'shawarma',
      'pizza',
      'burger',
      'sushi',
      'salad',
      'romanian_menu',
      'pasta',
      'asian',
    ]);
    for (const cuisine of EAT_OUT_CUISINES) {
      expect(EAT_OUT_CUISINE_LABELS[cuisine]).toBeTruthy();
      for (const size of EAT_OUT_SIZES) expect(eatOutEstimates[cuisine][size]).toBeDefined();
    }
  });

  it('is rounded UP: kcal to a multiple of 50, protein to a multiple of 5', () => {
    for (const cuisine of EAT_OUT_CUISINES) {
      for (const size of EAT_OUT_SIZES) {
        const { kcal, protein } = eatOutEstimate(cuisine, size);
        expect(kcal.min % 50).toBe(0);
        expect(kcal.max % 50).toBe(0);
        expect(protein.min % 5).toBe(0);
        expect(protein.max % 5).toBe(0);
      }
    }
  });

  it('is a real range that grows with the size, for every cuisine', () => {
    for (const cuisine of EAT_OUT_CUISINES) {
      const light = eatOutEstimate(cuisine, 'light');
      const normal = eatOutEstimate(cuisine, 'normal');
      const big = eatOutEstimate(cuisine, 'big');
      for (const e of [light, normal, big]) {
        expect(e.kcal.min).toBeLessThan(e.kcal.max);
        expect(e.protein.min).toBeLessThan(e.protein.max);
      }
      expect(light.kcal.max).toBeLessThanOrEqual(normal.kcal.max);
      expect(normal.kcal.max).toBeLessThanOrEqual(big.kcal.max);
      expect(light.protein.max).toBeLessThanOrEqual(normal.protein.max);
      expect(normal.protein.max).toBeLessThanOrEqual(big.protein.max);
    }
  });

  it('stays in a believable restaurant band', () => {
    for (const cuisine of EAT_OUT_CUISINES) {
      for (const size of EAT_OUT_SIZES) {
        const { kcal, protein } = eatOutEstimate(cuisine, size);
        expect(kcal.min).toBeGreaterThanOrEqual(250);
        expect(kcal.max).toBeLessThanOrEqual(1500);
        expect(protein.min).toBeGreaterThanOrEqual(10);
        expect(protein.max).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe('formatting', () => {
  it('shawarma · normal reads "≈ 700–850 kcal"', () => {
    const e = eatOutEstimate('shawarma', 'normal');
    expect(formatEatOutKcal(e, 'en-US')).toBe('≈ 700–850 kcal');
    expect(formatEatOutProtein(e)).toBe('≈ 35–45 g protein');
  });

  it('groups thousands', () => {
    expect(formatEatOutKcal(eatOutEstimate('burger', 'big'), 'en-US')).toBe('≈ 1,200–1,450 kcal');
  });

  it('names the entry', () => {
    expect(eatOutMealName('shawarma', 'normal')).toBe('Shawarma · normal');
    expect(eatOutMealName('romanian_menu', 'big')).toBe('Romanian lunch menu · big');
  });

  it('logs the middle of the range', () => {
    expect(eatOutLogValues(eatOutEstimate('shawarma', 'normal'))).toEqual({
      kcal: 775,
      protein: 40,
    });
  });
});
