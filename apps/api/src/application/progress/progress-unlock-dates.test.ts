import { describe, expect, it } from 'vitest';
import { buildUnlockDates } from './progress-unlock-dates.js';

const cook = (localDate: string, recipeId: string) => ({
  kind: 'COOK_FINISHED',
  localDate,
  meta: { recipeId },
});

describe('buildUnlockDates', () => {
  it('dates each tier on the day its threshold was crossed', () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      cook(`2026-09-${String(i + 1).padStart(2, '0')}`, `r${i % 6}`),
    );
    const dates = buildUnlockDates({ events, flameBest: [], trainingBest: [] });

    expect(dates.get('HOME_CHEF:1')).toBe('2026-09-10');
    expect(dates.has('HOME_CHEF:2')).toBe(false);
    // 5 distinct recipes were reached on the 5th cook.
    expect(dates.get('RECIPE_EXPLORER:1')).toBe('2026-09-05');
  });

  it('counts a day logged once however many meals it had, and sums PRs', () => {
    const events = [
      ...Array.from({ length: 7 }, (_, i) => [
        { kind: 'MEAL_LOGGED', localDate: `2026-09-0${i + 1}`, meta: {} },
        { kind: 'MEAL_LOGGED', localDate: `2026-09-0${i + 1}`, meta: {} },
      ]).flat(),
      { kind: 'WORKOUT_PRS', localDate: '2026-09-02', meta: { prCount: 3 } },
      { kind: 'WORKOUT_PRS', localDate: '2026-09-05', meta: { prCount: 2 } },
    ];
    const dates = buildUnlockDates({ events, flameBest: [], trainingBest: [] });
    expect(dates.get('HONEST_LOGGER:1')).toBe('2026-09-07');
    expect(dates.get('PR_MACHINE:1')).toBe('2026-09-05');
  });

  it('reads the Flame and the gym streak from their dated best-so-far series', () => {
    const dates = buildUnlockDates({
      events: [],
      flameBest: [
        { date: '2026-09-06', value: 2 },
        { date: '2026-09-13', value: 4 },
      ],
      trainingBest: [{ date: '2026-09-20', value: 5 }],
    });
    expect(dates.get('FLAME:1')).toBe('2026-09-13');
    expect(dates.get('IRON_WEEKS:1')).toBe('2026-09-20');
    expect(dates.has('FLAME:2')).toBe(false);
  });
});
