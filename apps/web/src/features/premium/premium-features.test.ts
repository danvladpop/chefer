import { describe, expect, it } from 'vitest';
import { PLAN_FEATURES, PREMIUM_PERK_KEYS } from '@chefer/types';
import { FREE_EQUIVALENT_LABELS, PREMIUM_FEATURE_CARDS } from './premium-features';

// WP-07 (owner decision 2026-10-02, "Premium is for heavy AI only"): the week
// rebalance and training-day nutrition use no AI, so nothing on /premium or in
// the upgrade dialog may sell them. Only the AI week stays a premium card.
const FREE_FOR_EVERYONE = ['weekRebalance', 'trainingNutrition', 'trainingDayTargets'] as const;

describe('premium feature registry (WP-07)', () => {
  it('has no card for week rebalance or training-day nutrition', () => {
    const keys = PREMIUM_FEATURE_CARDS.map((c) => c.key);
    for (const key of FREE_FOR_EVERYONE) expect(keys).not.toContain(key);
    expect(keys).toContain('aiMealPlans');
  });

  it('has no pantry card — the pantry is retired and never sold (WP-24 / FB7-10)', () => {
    expect(PREMIUM_FEATURE_CARDS.map((c) => c.key)).not.toContain('pantryPlanning');
    expect(PLAN_FEATURES.pantryPlanning.upsell).toBe(false);
    expect(PREMIUM_PERK_KEYS).not.toContain('pantryPlanning');
  });

  it('has no "free equivalent" label (they are free, not a lesser tier)', () => {
    for (const key of FREE_FOR_EVERYONE) expect(FREE_EQUIVALENT_LABELS[key]).toBeUndefined();
  });

  it('every card is a real premium upsell in the plan matrix', () => {
    for (const { key } of PREMIUM_FEATURE_CARDS) {
      expect(PLAN_FEATURES[key].free).toBe(false);
    }
    for (const key of FREE_FOR_EVERYONE) {
      expect(PLAN_FEATURES[key].free).toBe(true);
      expect(PLAN_FEATURES[key].upsell).toBe(false);
    }
  });
});
