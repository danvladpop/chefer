import { describe, expect, it } from 'vitest';
import type { TargetsView } from '@chefer/types';
import { buildProteinGuide, explainProteinTarget } from './protein-guide';

describe('buildProteinGuide', () => {
  it('turns ~105 g over 3 meals into 30–40 g per meal (D-5 example)', () => {
    const g = buildProteinGuide(105, 3);
    expect(g).toMatchObject({ proteinG: 105, meals: 3, perMealG: 35, lowG: 30, highG: 40 });
    expect(g.label).toBe('30–40 g per meal');
  });

  it('centres a 10 g window on the per-meal figure, aligned to 5 g', () => {
    expect(buildProteinGuide(100, 3).label).toBe('30–40 g per meal'); // 33.3 -> 35
    expect(buildProteinGuide(120, 3).label).toBe('35–45 g per meal'); // 40
    expect(buildProteinGuide(150, 4).label).toBe('35–45 g per meal'); // 37.5 -> 40
  });

  it('never goes below 5 g and survives tiny or zero targets', () => {
    expect(buildProteinGuide(0, 3)).toMatchObject({ lowG: 5, highG: 15 });
    expect(buildProteinGuide(10, 3).lowG).toBe(5);
  });

  it('falls back to 3 meals when the count is missing, zero or not finite', () => {
    expect(buildProteinGuide(120, 0).meals).toBe(3);
    expect(buildProteinGuide(120, Number.NaN).meals).toBe(3);
    expect(buildProteinGuide(120, -2).meals).toBe(3);
  });

  it('floors fractional meal counts', () => {
    expect(buildProteinGuide(120, 3.9).meals).toBe(3);
  });
});

function view(over: {
  proteinG: number;
  weightKg: number | null;
  source?: 'own' | 'suggested';
  gPerKg?: number | null;
}): Pick<TargetsView, 'effective' | 'source' | 'inputs'> {
  return {
    effective: { dailyCalorieTarget: 2000, proteinG: over.proteinG, carbsG: 200, fatG: 60 },
    source: over.source ?? 'suggested',
    inputs: {
      weightKg: over.weightKg,
      heightCm: 170,
      age: 30,
      activity: 'MODERATELY_ACTIVE',
      goal: 'MAINTAIN',
      isLifter: over.gPerKg != null,
      proteinGPerKg: over.gPerKg ?? null,
      usedAdjustedWeight: false,
      rate: null,
    },
  };
}

describe('explainProteinTarget', () => {
  it('reports no difference at ~1.6 g/kg', () => {
    const w = explainProteinTarget(view({ proteinG: 120, weightKg: 75, gPerKg: 1.6 }));
    expect(w.differs).toBe(false);
    expect(w.gPerKg).toBe(1.6);
    expect(w.referenceG).toBe(120);
    expect(w.reason).toBe('LIFTER_GOAL');
  });

  it('explains a lifter goal rule that differs from 1.6 g/kg', () => {
    const w = explainProteinTarget(view({ proteinG: 150, weightKg: 75, gPerKg: 2 }));
    expect(w.differs).toBe(true);
    expect(w.reason).toBe('LIFTER_GOAL');
    expect(w.sentence).toContain('150 g');
    expect(w.sentence).toContain('120 g for you');
  });

  it('explains a goal-split target that differs', () => {
    const w = explainProteinTarget(view({ proteinG: 90, weightKg: 75 }));
    expect(w).toMatchObject({ differs: true, reason: 'GOAL_SPLIT', gPerKg: 1.2, referenceG: 120 });
  });

  it('names the user own override', () => {
    const w = explainProteinTarget(view({ proteinG: 180, weightKg: 75, source: 'own' }));
    expect(w).toMatchObject({ differs: true, reason: 'OWN' });
    expect(w.sentence).toMatch(/You set your own/);
  });

  it('does not invent numbers without a weight', () => {
    const w = explainProteinTarget(view({ proteinG: 110, weightKg: null }));
    expect(w).toMatchObject({
      differs: false,
      reason: 'NO_WEIGHT',
      gPerKg: null,
      referenceG: null,
    });
  });
});
