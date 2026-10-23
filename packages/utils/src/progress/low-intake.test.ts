import { describe, expect, it } from 'vitest';
import { lowIntakeSignal } from './low-intake';

const day = (n: number, totalKcal: number, full = true) => ({
  localDate: `2026-10-${String(n).padStart(2, '0')}`,
  totalKcal,
  full,
});

describe('lowIntakeSignal', () => {
  it('is true when 3 of the 7 most recent full days are under the floor', () => {
    const days = [day(20, 900), day(19, 1800), day(18, 1000), day(17, 1900), day(16, 800)];
    expect(lowIntakeSignal(days, 1200)).toBe(true);
  });

  it('is false with only 2 low days', () => {
    expect(lowIntakeSignal([day(20, 900), day(19, 1800), day(18, 1000)], 1200)).toBe(false);
  });

  it('ignores days that are not full', () => {
    const days = [day(20, 300, false), day(19, 300, false), day(18, 300, false), day(17, 1800)];
    expect(lowIntakeSignal(days, 1200)).toBe(false);
  });

  it('only looks at the 7 most recent full days, whatever the input order', () => {
    const recentOk = [20, 19, 18, 17, 16, 15, 14].map((n) => day(n, 1800));
    const olderLow = [13, 12, 11].map((n) => day(n, 900));
    expect(lowIntakeSignal([...olderLow, ...recentOk], 1200)).toBe(false);
    expect(lowIntakeSignal([...recentOk.reverse(), ...olderLow], 1200)).toBe(false);
  });

  it('a day exactly at the floor is not low', () => {
    expect(lowIntakeSignal([day(20, 1200), day(19, 1200), day(18, 1200)], 1200)).toBe(false);
  });

  it('is false for no days', () => {
    expect(lowIntakeSignal([], 1200)).toBe(false);
  });
});
