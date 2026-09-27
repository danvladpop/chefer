import { describe, expect, it } from 'vitest';
import { pickProteinSnacks, PROTEIN_SNACKS } from './protein-snacks';

describe('pickProteinSnacks', () => {
  it('returns the requested count', () => {
    expect(pickProteinSnacks(2)).toHaveLength(2);
  });

  it('defaults to 3', () => {
    expect(pickProteinSnacks()).toHaveLength(3);
  });

  it('never exceeds the curated list', () => {
    expect(pickProteinSnacks(100)).toHaveLength(PROTEIN_SNACKS.length);
  });

  it('every snack has positive macros', () => {
    for (const snack of PROTEIN_SNACKS) {
      expect(snack.proteinG).toBeGreaterThan(0);
      expect(snack.kcal).toBeGreaterThan(0);
    }
  });
});
