import { describe, expect, it } from 'vitest';
import { weekAverageLine, weekAverages } from './week-average';

const day = (totalKcal: number, totalProtein: number, hasLog = true) => ({
  totalKcal,
  totalProtein,
  hasLog,
});

describe('weekAverages (Food 2: the praised number is the week)', () => {
  it('averages only the days that have a log', () => {
    expect(
      weekAverages([day(1800, 120), day(1480, 104), day(0, 0, false), day(0, 0, false)]),
    ).toEqual({ kcal: 1640, protein: 112 });
  });

  it('is null with fewer than two logged days', () => {
    expect(weekAverages([day(1800, 120), day(0, 0, false)])).toBeNull();
    expect(weekAverageLine([])).toBeNull();
  });

  it('reads "This week you averaged 1,640 kcal · 112 g protein a day"', () => {
    expect(weekAverageLine([day(1800, 120), day(1480, 104)])).toBe(
      'This week you averaged 1,640 kcal · 112 g protein a day',
    );
  });
});
