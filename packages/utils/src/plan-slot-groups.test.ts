import { describe, expect, it } from 'vitest';
import { canRemoveSlot, groupDaySlots } from './plan-slot-groups';

const day = [
  { type: 'breakfast', id: 'b' },
  { type: 'lunch', id: 'l-main' },
  { type: 'dinner', id: 'd' },
  { type: 'lunch', id: 'l-side' }, // a side appended to the end of the day's slots
  { type: 'snack', id: 's1' },
  { type: 'snack', id: 's2' },
];

describe('groupDaySlots (FB7-04)', () => {
  it('groups same-type slots, in order of first appearance, keeping original slot indexes', () => {
    const groups = groupDaySlots(day);
    expect(groups.map((g) => g.mealType)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    const lunch = groups[1];
    if (!lunch) throw new Error('no lunch group');
    expect(lunch.main.meal.id).toBe('l-main');
    expect(lunch.main.slotIndex).toBe(1);
    expect(lunch.sides.map((s) => [s.meal.id, s.slotIndex])).toEqual([['l-side', 3]]);
    expect(lunch.entries).toHaveLength(2);
    expect(groups[3]?.sides.map((s) => s.slotIndex)).toEqual([5]);
  });

  it('a day with one slot per type has no sides', () => {
    const groups = groupDaySlots([{ type: 'breakfast' }, { type: 'lunch' }, { type: 'dinner' }]);
    expect(groups.every((g) => g.sides.length === 0)).toBe(true);
  });

  it('an empty day has no groups', () => {
    expect(groupDaySlots([])).toEqual([]);
  });
});

describe('canRemoveSlot', () => {
  it('only when another slot of the same type remains', () => {
    expect(canRemoveSlot(day, 3)).toBe(true);
    expect(canRemoveSlot(day, 1)).toBe(true);
    expect(canRemoveSlot(day, 0)).toBe(false);
    expect(canRemoveSlot(day, 99)).toBe(false);
  });
});
