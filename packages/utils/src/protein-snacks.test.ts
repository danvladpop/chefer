import { describe, expect, it } from 'vitest';
import { pickProteinSnacks, PROTEIN_SNACKS, takeSnacks } from './protein-snacks';

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

describe('snack data for the safety filter (T-06.3)', () => {
  it('every snack names its ingredients and diet tags', () => {
    for (const snack of PROTEIN_SNACKS) {
      expect(snack.ingredients.length).toBeGreaterThan(0);
      expect(snack.dietaryTags.length).toBeGreaterThan(0);
    }
  });

  it('no dairy or egg snack is tagged dairy-free / egg-free', () => {
    const yogurt = PROTEIN_SNACKS.find((s) => s.id === 'greek-yogurt');
    expect(yogurt?.dietaryTags).not.toContain('dairy-free');
    const eggs = PROTEIN_SNACKS.find((s) => s.id === 'boiled-eggs');
    expect(eggs?.dietaryTags).not.toContain('egg-free');
    expect(eggs?.dietaryTags).not.toContain('vegan');
  });

  it('takeSnacks takes the first n', () => {
    expect(takeSnacks([1, 2, 3], 2)).toEqual([1, 2]);
    expect(takeSnacks([1], 2)).toEqual([1]);
  });
});
