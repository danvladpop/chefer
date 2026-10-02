import { describe, expect, it } from 'vitest';
import {
  calorieFloor,
  computeBmrTdee,
  computeCalorieTarget,
  goalAdjustmentKcal,
  isDeficitBlockedForAge,
  previewCalorieTarget,
} from './calorie-target';

// The App Review repro: female, 13, 152 cm, 44 kg, sedentary, lose weight.
const REPRO = [44, 152, 13, 'SEDENTARY', 'FEMALE'] as const;

describe('calorieFloor', () => {
  it('is 1,500 for men and 1,200 for women and unknown', () => {
    expect(calorieFloor('MALE')).toBe(1500);
    expect(calorieFloor('FEMALE')).toBe(1200);
    expect(calorieFloor(null)).toBe(1200);
    expect(calorieFloor(undefined)).toBe(1200);
  });
});

describe('minors never get a deficit', () => {
  it('turns LOSE_WEIGHT into maintenance under 18', () => {
    expect(goalAdjustmentKcal('LOSE_WEIGHT', 13)).toBe(0);
    expect(goalAdjustmentKcal('LOSE_WEIGHT', 17)).toBe(0);
    expect(isDeficitBlockedForAge('LOSE_WEIGHT', 17)).toBe(true);
  });

  it('computes the App Review repro as maintenance, not 1,200', () => {
    const { tdee } = computeBmrTdee(...REPRO);
    expect(tdee).toBe(1397);
    expect(computeCalorieTarget(...REPRO, 'LOSE_WEIGHT')).toBe(1397);
  });

  it('keeps surplus goals for minors (only deficits are blocked)', () => {
    expect(goalAdjustmentKcal('GAIN_MUSCLE', 17)).toBe(300);
    expect(isDeficitBlockedForAge('GAIN_MUSCLE', 17)).toBe(false);
    expect(isDeficitBlockedForAge('MAINTAIN', 17)).toBe(false);
  });

  it('applies the deficit from 18', () => {
    expect(goalAdjustmentKcal('LOSE_WEIGHT', 18)).toBe(-500);
    expect(isDeficitBlockedForAge('LOSE_WEIGHT', 18)).toBe(false);
  });

  it('does not crash on stored ages below 16 and treats them as minors', () => {
    expect(() =>
      computeCalorieTarget(60, 165, 10, 'MODERATELY_ACTIVE', 'FEMALE', 'LOSE_WEIGHT'),
    ).not.toThrow();
    expect(goalAdjustmentKcal('LOSE_WEIGHT', 10)).toBe(0);
  });

  it('treats an unknown age as an adult (nothing to protect)', () => {
    expect(goalAdjustmentKcal('LOSE_WEIGHT', null)).toBe(-500);
  });
});

describe('adults are unchanged', () => {
  it('female adult: TDEE − 500', () => {
    const { tdee } = computeBmrTdee(70, 165, 30, 'LIGHTLY_ACTIVE', 'FEMALE');
    expect(computeCalorieTarget(70, 165, 30, 'LIGHTLY_ACTIVE', 'FEMALE', 'LOSE_WEIGHT')).toBe(
      tdee - 500,
    );
  });

  it('male adult: Mifflin-St Jeor with +5', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780 → ×1.55 = 2759
    expect(computeBmrTdee(80, 180, 30, 'MODERATELY_ACTIVE', 'MALE')).toEqual({
      bmr: 1780,
      tdee: 2759,
    });
    expect(computeCalorieTarget(80, 180, 30, 'MODERATELY_ACTIVE', 'MALE', 'GAIN_MUSCLE')).toBe(
      3059,
    );
  });

  it('unknown activity falls back to moderately active', () => {
    expect(computeBmrTdee(70, 170, 30, null, 'FEMALE').tdee).toBe(
      computeBmrTdee(70, 170, 30, 'MODERATELY_ACTIVE', 'FEMALE').tdee,
    );
  });
});

describe('sex-specific floors', () => {
  it('floors a small adult woman at 1,200', () => {
    expect(computeCalorieTarget(45, 150, 40, 'SEDENTARY', 'FEMALE', 'LOSE_WEIGHT')).toBe(1200);
  });

  it('floors a small adult man at 1,500', () => {
    // BMR 10*50 + 6.25*155 - 5*60 + 5 = 1173.75 → TDEE ~1408; −500 → 908 → floor 1500
    expect(computeCalorieTarget(50, 155, 60, 'SEDENTARY', 'MALE', 'LOSE_WEIGHT')).toBe(1500);
  });

  it('floors unknown sex at 1,200', () => {
    expect(computeCalorieTarget(45, 150, 40, 'SEDENTARY', null, 'LOSE_WEIGHT')).toBe(1200);
  });

  it('floors a minor maintenance target too', () => {
    // A very small maintenance TDEE is still lifted to the floor.
    expect(computeCalorieTarget(30, 120, 17, 'SEDENTARY', 'MALE', 'MAINTAIN')).toBe(1500);
  });
});

describe('previewCalorieTarget', () => {
  it('reports maintenance, target and why', () => {
    const p = previewCalorieTarget(...REPRO, 'LOSE_WEIGHT');
    expect(p).toEqual({ maintenance: 1397, target: 1397, deficitBlocked: true, flooredAt: null });
  });

  it('reports the floor when it applies', () => {
    const p = previewCalorieTarget(45, 150, 40, 'SEDENTARY', 'FEMALE', 'LOSE_WEIGHT');
    expect(p.target).toBe(1200);
    expect(p.flooredAt).toBe(1200);
    expect(p.deficitBlocked).toBe(false);
  });

  it('matches computeCalorieTarget', () => {
    const args = [82, 178, 35, 'VERY_ACTIVE', 'MALE'] as const;
    expect(previewCalorieTarget(...args, 'LOSE_WEIGHT').target).toBe(
      computeCalorieTarget(...args, 'LOSE_WEIGHT'),
    );
  });
});
