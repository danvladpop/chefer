import { describe, expect, it } from 'vitest';
import { workoutFinishedKind } from './analytics';

describe('workoutFinishedKind (UX-PO-02)', () => {
  it('is planned for a routine day and freestyle for an ad-hoc session', () => {
    expect(workoutFinishedKind({ routineDayId: 'day-a' })).toBe('planned');
    expect(workoutFinishedKind({ routineDayId: null })).toBe('freestyle');
  });
});
