import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_STEP_COPY,
  activationIntro,
  activationStepCopy,
  activationStepKeys,
  PLAN_WEEK_STEP_COPY,
} from './premium-activation';

describe('activationStepKeys (F-PREM-1-5, F-PM-9)', () => {
  it('a household upgrade leads with "Add your table"', () => {
    const keys = activationStepKeys('household', true);
    expect(keys[0]).toBe('household');
    expect(ACTIVATION_STEP_COPY.household.title).toBe('Add your table');
  });

  it('never offers the goal step to a user who already has a profile', () => {
    for (const source of [null, 'household', 'preferences-locked', 'coach-review', 'swap']) {
      const keys = activationStepKeys(source, true);
      expect(keys).not.toContain('profile');
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  it('a user without a profile gets the goal step (first by default)', () => {
    expect(activationStepKeys(null, false)[0]).toBe('profile');
    expect(activationStepKeys('household', false)).toEqual(['household', 'profile', 'regenerate']);
  });

  it('orders by the source and caps at three', () => {
    expect(activationStepKeys('recipe-import', true)).toEqual(['cheferize', 'regenerate']);
    expect(activationStepKeys('unknown-source', false)).toHaveLength(3);
  });

  it('the retired pantry source (WP-24) falls back to the default order', () => {
    expect(activationStepKeys('pantry', true)).toEqual(activationStepKeys(null, true));
    expect(activationStepKeys('pantry', false)).toEqual(['profile', 'regenerate', 'cheferize']);
  });

  it('introduces the list by its length', () => {
    expect(activationIntro(1)).toBe('One thing makes it worth it immediately:');
    expect(activationIntro(2)).toMatch(/^Two things/);
    expect(activationIntro(3)).toMatch(/^Three things/);
  });
});

describe('source-aware post-upgrade steps (UX-ACC-13)', () => {
  it('Snap leads with "Snap your next meal", never with a regenerate', () => {
    const keys = activationStepKeys('snap-scan', true);
    expect(keys[0]).toBe('snap');
    expect(ACTIVATION_STEP_COPY.snap.title).toBe('Snap your next meal');
  });

  it('with no plan the regenerate step becomes "Plan my week"', () => {
    expect(activationStepCopy('regenerate', { hasPlan: false })).toBe(PLAN_WEEK_STEP_COPY);
    expect(PLAN_WEEK_STEP_COPY.title).toBe('Plan my week');
  });

  it('keeps "Regenerate this week" when a plan exists or is not known yet', () => {
    expect(activationStepCopy('regenerate', { hasPlan: true }).title).toBe('Regenerate this week');
    expect(activationStepCopy('regenerate').title).toBe('Regenerate this week');
    expect(activationStepCopy('household', { hasPlan: false })).toBe(
      ACTIVATION_STEP_COPY.household,
    );
  });
});
