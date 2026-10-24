import { describe, expect, it } from 'vitest';
import { isFullDay } from './full-day';

const slot = (mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', slotIndex: number) => ({
  mealType,
  slotIndex,
});

describe('isFullDay', () => {
  const plan = [slot('breakfast', 0), slot('lunch', 1), slot('dinner', 2)];

  it('with a plan: every slot handled and at least two logged', () => {
    expect(isFullDay({ planSlots: plan, handledSlots: plan, loggedCount: 3 })).toBe(true);
    // one slot skipped (handled but not logged)
    expect(isFullDay({ planSlots: plan, handledSlots: plan, loggedCount: 2 })).toBe(true);
  });

  it('with a plan: an open slot keeps the day open', () => {
    expect(isFullDay({ planSlots: plan, handledSlots: plan.slice(0, 2), loggedCount: 2 })).toBe(
      false,
    );
  });

  it('with a plan: skipping everything is not a full day', () => {
    expect(isFullDay({ planSlots: plan, handledSlots: plan, loggedCount: 1 })).toBe(false);
    expect(isFullDay({ planSlots: plan, handledSlots: plan, loggedCount: 0 })).toBe(false);
  });

  it('matches slots by meal type and index', () => {
    expect(
      isFullDay({
        planSlots: [slot('snack', 0), slot('snack', 1)],
        handledSlots: [slot('snack', 0), slot('snack', 0)],
        loggedCount: 3,
      }),
    ).toBe(false);
  });

  it('without a plan: three logged entries make a full day', () => {
    expect(isFullDay({ planSlots: [], handledSlots: [], loggedCount: 2 })).toBe(false);
    expect(isFullDay({ planSlots: [], handledSlots: [], loggedCount: 3 })).toBe(true);
    expect(isFullDay({ planSlots: [], handledSlots: [], loggedCount: 6 })).toBe(true);
  });
});
