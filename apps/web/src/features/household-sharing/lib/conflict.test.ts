import { describe, expect, it } from 'vitest';
import { isHealthConsentRequired, isMealSlotConflict } from './conflict';

describe('isMealSlotConflict', () => {
  it('is true only for a mealSlot conflict', () => {
    expect(
      isMealSlotConflict({
        data: { code: 'CONFLICT', conflict: { kind: 'mealSlot', current: {} } },
      }),
    ).toBe(true);
    expect(isMealSlotConflict({ data: { code: 'CONFLICT', conflict: { kind: 'routine' } } })).toBe(
      false,
    );
    expect(isMealSlotConflict({ data: { code: 'CONFLICT', conflict: null } })).toBe(false);
    expect(isMealSlotConflict(new Error('x'))).toBe(false);
    expect(isMealSlotConflict(null)).toBe(false);
  });
});

describe('isHealthConsentRequired', () => {
  it('reads the errorFormatter flag', () => {
    expect(isHealthConsentRequired({ data: { healthConsentRequired: true } })).toBe(true);
    expect(isHealthConsentRequired({ data: { healthConsentRequired: false } })).toBe(false);
    expect(isHealthConsentRequired(undefined)).toBe(false);
  });
});
