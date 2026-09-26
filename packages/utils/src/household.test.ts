import { describe, expect, it } from 'vitest';
import {
  householdGhostSample,
  householdPortionSum,
  onboardingProgress,
  onboardingSteps,
  perPortionCost,
} from './household';

describe('householdPortionSum', () => {
  it('is 1 for the owner alone', () => {
    expect(householdPortionSum([])).toBe(1);
  });

  it('adds member portions and rounds up to whole servings', () => {
    expect(householdPortionSum([{ portionFactor: 1 }, { portionFactor: 0.5 }])).toBe(3);
    expect(householdPortionSum([{ portionFactor: 0.5 }, { portionFactor: 0.5 }])).toBe(2);
    expect(householdPortionSum([{ portionFactor: 0.25 }])).toBe(2);
  });

  it('ignores float noise and negative factors', () => {
    expect(
      householdPortionSum([
        { portionFactor: 0.25 },
        { portionFactor: 0.25 },
        { portionFactor: 0.5 },
      ]),
    ).toBe(2);
    expect(householdPortionSum([{ portionFactor: -3 }])).toBe(1);
  });
});

describe('perPortionCost', () => {
  it('divides by the portions the list was sized for', () => {
    expect(perPortionCost(90, 3)).toBe(30);
    expect(perPortionCost(10, 3)).toBe(3.33);
  });

  it('is null when either side is unknown', () => {
    expect(perPortionCost(null, 3)).toBeNull();
    expect(perPortionCost(90, undefined)).toBeNull();
    expect(perPortionCost(90, 0)).toBeNull();
  });
});

describe('onboardingSteps', () => {
  it('asks the intent first and keeps the free food flow for solo users', () => {
    expect(onboardingSteps({ intent: null, askIntent: true, isPremium: false })).toEqual([
      'intent',
      'diet',
      'goal',
      'metrics',
    ]);
    expect(onboardingSteps({ intent: 'EAT_BETTER', askIntent: true, isPremium: false })).toEqual([
      'intent',
      'diet',
      'goal',
      'metrics',
    ]);
  });

  it('routes households to "who is at your table" before the food steps', () => {
    expect(onboardingSteps({ intent: 'HOUSEHOLD', askIntent: true, isPremium: false })).toEqual([
      'intent',
      'table',
      'diet',
      'goal',
      'metrics',
    ]);
  });

  it('stops after the question for gym-goers (gym setup comes first)', () => {
    expect(onboardingSteps({ intent: 'TRAIN', askIntent: true, isPremium: false })).toEqual([
      'intent',
    ]);
  });

  it('gives a returning gym-goer the food setup they postponed', () => {
    expect(onboardingSteps({ intent: 'TRAIN', askIntent: false, isPremium: false })).toEqual([
      'diet',
      'goal',
      'metrics',
    ]);
  });

  it('premium food flow has no serving-size step of its own (F-PM-8)', () => {
    expect(onboardingSteps({ intent: null, askIntent: false, isPremium: true })).toEqual([
      'goal',
      'metrics',
      'diet',
      'cuisine',
    ]);
  });
});

describe('householdGhostSample', () => {
  it('the kid chip shows a kid at half a portion with a common allergy (F-PM-12)', () => {
    const kid = householdGhostSample('kid');
    expect(kid.isKid).toBe(true);
    expect(kid.portionFactor).toBe(0.5);
    expect(kid.allergies.length).toBeGreaterThan(0);
  });

  it('the partner chip shows an adult', () => {
    const partner = householdGhostSample('partner');
    expect(partner.isKid).toBe(false);
    expect(partner.portionFactor).toBe(1);
  });
});

describe('onboardingProgress (counter never grows)', () => {
  it('shows "Step 1" with no total while the intent question is open', () => {
    for (const intent of [null, 'HOUSEHOLD', 'TRAIN', 'EAT_BETTER'] as const) {
      const steps = onboardingSteps({ intent, askIntent: true, isPremium: false });
      expect(onboardingProgress(steps, 0)).toEqual({ label: 'Step 1', total: null, percent: null });
    }
  });

  it('shows the fixed total once the intent is answered', () => {
    const steps = onboardingSteps({ intent: 'HOUSEHOLD', askIntent: true, isPremium: false });
    expect(onboardingProgress(steps, 1)).toEqual({ label: 'Step 2 of 5', total: 5, percent: 40 });
    expect(onboardingProgress(steps, 4).percent).toBe(100);
  });

  it('counts normally when the question is not asked', () => {
    const steps = onboardingSteps({ intent: 'TRAIN', askIntent: false, isPremium: true });
    expect(onboardingProgress(steps, 0)).toEqual({ label: 'Step 1 of 4', total: 4, percent: 25 });
  });
});
