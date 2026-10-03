import { describe, expect, it } from 'vitest';
import { evenLabelIndices, isLoggedDay } from './progress-days';

describe('isLoggedDay (UX-FOOD-20)', () => {
  it('needs a log with something in it', () => {
    expect(isLoggedDay({ hasLog: true, totalKcal: 1800 })).toBe(true);
    expect(isLoggedDay({ hasLog: false, totalKcal: 0 })).toBe(false);
    // An emptied day keeps its log row.
    expect(isLoggedDay({ hasLog: true, totalKcal: 0 })).toBe(false);
  });
});

describe('evenLabelIndices', () => {
  it('spaces labels evenly and keeps both ends', () => {
    expect(evenLabelIndices(28)).toEqual([0, 7, 14, 20, 27]);
    expect(evenLabelIndices(7, 4)).toEqual([0, 2, 4, 6]);
  });
  it('never repeats an index on a short series', () => {
    expect(evenLabelIndices(3)).toEqual([0, 1, 2]);
    expect(evenLabelIndices(1)).toEqual([0]);
    expect(evenLabelIndices(0)).toEqual([]);
  });
});
