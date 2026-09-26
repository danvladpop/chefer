import { describe, expect, it } from 'vitest';
import { activationSteps } from './activation-steps';

describe('activationSteps (F-PREM-1-5, F-PM-9)', () => {
  it('a household upgrade leads with "Add your table" in Preferences', () => {
    const steps = activationSteps('household', true);
    expect(steps[0]).toMatchObject({ key: 'household', href: '/preferences#household' });
    expect(steps.map((s) => s.title)).toContain('Add your table');
  });

  it('never sends a user who already has a profile to /onboarding', () => {
    for (const source of [null, 'household', 'preferences-locked', 'coach-review', 'swap']) {
      const steps = activationSteps(source, true);
      expect(steps.some((s) => s.href === '/onboarding')).toBe(false);
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  it('a user without a profile still gets the goal step first by default', () => {
    expect(activationSteps(null, false)[0]?.key).toBe('profile');
    expect(activationSteps('household', false).map((s) => s.key)).toEqual([
      'household',
      'profile',
      'regenerate',
    ]);
  });

  it('orders by the source and caps at three', () => {
    expect(activationSteps('recipe-import', true).map((s) => s.key)).toEqual([
      'cheferize',
      'regenerate',
    ]);
    expect(activationSteps('unknown-source', false)).toHaveLength(3);
  });
});
