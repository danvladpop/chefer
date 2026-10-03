import { describe, expect, it } from 'vitest';
import type { GymProfileDto } from '@chefer/types';
import { applyProfileInput, revertProfileInput } from './use-save-gym-profile';

const profile = {
  experience: 'BEGINNER',
  unit: 'KG',
  weeklyGoal: 3,
  barWeightKg: 20,
  reminderEnabled: false,
  reminderTime: null,
} as unknown as GymProfileDto;

describe('optimistic gym profile save (UX-GYM-22)', () => {
  it('applies only the fields the input sets', () => {
    const next = applyProfileInput(profile, { weeklyGoal: 4 });
    expect(next.weeklyGoal).toBe(4);
    expect(next.unit).toBe('KG');
    expect(profile.weeklyGoal).toBe(3); // the cached profile is not mutated
  });

  it('ignores undefined fields in the input', () => {
    expect(applyProfileInput(profile, { weeklyGoal: undefined, unit: 'LB' })).toMatchObject({
      weeklyGoal: 3,
      unit: 'LB',
    });
  });

  it('rolls back only the failed save’s fields, keeping later changes', () => {
    // goal → 4 (optimistic), then unit → LB landed while goal's save was in flight.
    const current = {
      ...applyProfileInput(profile, { weeklyGoal: 4 }),
      unit: 'LB',
    } as GymProfileDto;
    const restored = revertProfileInput(current, profile, { weeklyGoal: 4 });
    expect(restored.weeklyGoal).toBe(3);
    expect(restored.unit).toBe('LB');
  });
});
