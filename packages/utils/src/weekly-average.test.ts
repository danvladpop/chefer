import { describe, expect, it } from 'vitest';
import { weeklyAverage, weeklyAverageText } from './weekly-average';

// WP-06 (Food 2): one rule for the mobile tracker and web Today.
const day = (date: string, kcal: number, protein: number, hasLog = true) => ({
  date,
  totalKcal: kcal,
  totalProtein: protein,
  hasLog,
});

describe('weeklyAverage', () => {
  it('averages the logged days and leaves today out', () => {
    expect(
      weeklyAverage(
        [
          day('2026-09-01', 1800, 120),
          day('2026-09-02', 1480, 104),
          day('2026-09-03', 0, 0, false),
          day('2026-09-04', 300, 10),
        ],
        '2026-09-04',
      ),
    ).toEqual({ kcal: 1640, protein: 112, days: 2 });
  });

  it('is null with fewer than two logged days', () => {
    expect(weeklyAverage([day('2026-09-01', 1800, 120)], '2026-09-04')).toBeNull();
    expect(weeklyAverage([], '2026-09-04')).toBeNull();
  });

  it('reads "This week you averaged … a day"', () => {
    expect(weeklyAverageText({ kcal: 1640, protein: 112 })).toMatch(
      /^This week you averaged 1.640 kcal · 112 g protein a day$/,
    );
  });
});
