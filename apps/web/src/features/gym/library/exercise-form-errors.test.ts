import { describe, expect, it } from 'vitest';
import { exerciseNameError } from './exercise-form-errors';

describe('exerciseNameError', () => {
  it('says what to fix in plain words, never the raw schema text', () => {
    expect(exerciseNameError('too_small')).toBe('Give it a name of at least 2 characters.');
    expect(exerciseNameError('too_big')).toBe('Keep the name to 60 characters or fewer.');
    expect(exerciseNameError(undefined)).toMatch(/at least 2/);
    for (const type of ['too_small', 'too_big']) {
      expect(exerciseNameError(type)).not.toMatch(/String must|character\(s\)/);
    }
  });
});
