import { describe, expect, it } from 'vitest';
import {
  effectiveNumbersMode,
  numbersModeSchema,
  numbersVisibility,
  setNumbersModeInputSchema,
} from './numbers-mode';

describe('numbersModeSchema', () => {
  it('accepts the three modes, including the reserved NONE', () => {
    for (const m of ['FULL', 'PROTEIN_ONLY', 'NONE']) {
      expect(numbersModeSchema.parse(m)).toBe(m);
    }
  });

  it('rejects anything else', () => {
    expect(numbersModeSchema.safeParse('protein_only').success).toBe(false);
    expect(setNumbersModeInputSchema.safeParse({}).success).toBe(false);
    expect(setNumbersModeInputSchema.safeParse({ numbersMode: 'KETO' }).success).toBe(false);
  });
});

describe('effectiveNumbersMode', () => {
  it('maps null, undefined and unknown values to FULL', () => {
    expect(effectiveNumbersMode(null)).toBe('FULL');
    expect(effectiveNumbersMode(undefined)).toBe('FULL');
    expect(effectiveNumbersMode('SOMETHING_NEW')).toBe('FULL');
  });

  it('keeps FULL, PROTEIN_ONLY and (lane E3) NONE', () => {
    expect(effectiveNumbersMode('FULL')).toBe('FULL');
    expect(effectiveNumbersMode('PROTEIN_ONLY')).toBe('PROTEIN_ONLY');
    expect(effectiveNumbersMode('NONE')).toBe('NONE');
  });
});

describe('numbersVisibility (lane E3)', () => {
  it('FULL shows everything, PROTEIN_ONLY only protein, NONE nothing', () => {
    expect(numbersVisibility('FULL')).toEqual({ kcal: true, macros: true, protein: true });
    expect(numbersVisibility('PROTEIN_ONLY')).toEqual({
      kcal: false,
      macros: false,
      protein: true,
    });
    expect(numbersVisibility('NONE')).toEqual({ kcal: false, macros: false, protein: false });
  });
});
