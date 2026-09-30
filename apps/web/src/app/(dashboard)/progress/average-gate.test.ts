import { describe, expect, it } from 'vitest';
import { hasEnoughDaysForAverage, moreDaysHint } from './average-gate';

describe('progress average gate (T-11.6)', () => {
  it('needs three logged days', () => {
    expect(hasEnoughDaysForAverage(2)).toBe(false);
    expect(hasEnoughDaysForAverage(3)).toBe(true);
  });

  it('says how many more days to log', () => {
    expect(moreDaysHint(0)).toBe('Log 3 more days to see your average');
    expect(moreDaysHint(2)).toBe('Log 1 more day to see your average');
    expect(moreDaysHint(3)).toBeNull();
  });
});
