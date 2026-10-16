import { describe, expect, it } from 'vitest';
import { DAY_FIT_COPY, dayFitStatus, dayFitSuggestionCopy, describeDayFit } from './day-fit-copy';

describe('day rebalance copy', () => {
  it('one resized meal', () => {
    expect(describeDayFit({ dayOfWeek: 1, changes: [{ mealType: 'lunch', to: 1.5 }] })).toBe(
      'Lunch is now 1½× so Tuesday stays on target',
    );
  });

  it('several resized meals, and today', () => {
    expect(
      describeDayFit(
        {
          dayOfWeek: 1,
          changes: [
            { mealType: 'breakfast', to: 1.25 },
            { mealType: 'lunch', to: 2 },
          ],
        },
        { isToday: true },
      ),
    ).toBe('Breakfast and lunch resized so today stays on target');
  });

  it('nothing resized → null (the usual swap message shows)', () => {
    expect(describeDayFit({ dayOfWeek: 1, changes: [] })).toBeNull();
    expect(describeDayFit(null)).toBeNull();
  });

  it('suggestion card', () => {
    const c = dayFitSuggestionCopy(
      {
        kind: 'swap',
        mealType: 'breakfast',
        recipeName: 'Greek Yogurt Protein Bowl',
        kcalDelta: 390,
        proteinDelta: 31,
      },
      { dayOfWeek: 2, kcal: 1980 },
    );
    expect(c.lede).toBe(
      'Resizing portions only gets Wednesday to 1,980 kcal. One change closes it:',
    );
    expect(c.title).toBe('Breakfast → Greek Yogurt Protein Bowl');
    expect(c.detail).toBe('+390 kcal · +31 g protein');
    expect(c.action).toBe('Swap breakfast');
  });

  it('status lines', () => {
    expect(
      dayFitStatus({ kcal: 2390, targetKcal: 2400, onTarget: true, nothingOpen: false }).text,
    ).toBe('On target');
    expect(
      dayFitStatus({ kcal: 1980, targetKcal: 2700, onTarget: false, nothingOpen: false }),
    ).toEqual({
      text: '720 kcal short',
      tone: 'short',
    });
    expect(
      dayFitStatus({ kcal: 2620, targetKcal: 2400, onTarget: false, nothingOpen: true }).text,
    ).toBe('220 kcal over — your pick, nothing else to adjust');
    expect(DAY_FIT_COPY.refitBody(1)).toBe('Same meals, resized on 1 day to match.');
  });
});
