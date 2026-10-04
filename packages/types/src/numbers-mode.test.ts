import { describe, expect, it } from 'vitest';
import { effectiveNumbersMode, numbersModeSchema, setNumbersModeInputSchema } from './numbers-mode';

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
  it('maps null, undefined, NONE and unknown values to FULL', () => {
    expect(effectiveNumbersMode(null)).toBe('FULL');
    expect(effectiveNumbersMode(undefined)).toBe('FULL');
    expect(effectiveNumbersMode('NONE')).toBe('FULL');
    expect(effectiveNumbersMode('SOMETHING_NEW')).toBe('FULL');
  });

  it('keeps FULL and PROTEIN_ONLY', () => {
    expect(effectiveNumbersMode('FULL')).toBe('FULL');
    expect(effectiveNumbersMode('PROTEIN_ONLY')).toBe('PROTEIN_ONLY');
  });
});
