import { describe, expect, it } from 'vitest';
import { pauseEndDate, pauseReasonLabel, pauseStartDate, pauseSummaryLine } from './pause-copy';

// 2026-10-03 is a Saturday.
describe('pauseStartDate', () => {
  it('today / tomorrow / the coming Monday', () => {
    expect(pauseStartDate('today', '2026-10-03')).toBe('2026-10-03');
    expect(pauseStartDate('tomorrow', '2026-10-03')).toBe('2026-10-04');
    expect(pauseStartDate('monday', '2026-10-03')).toBe('2026-10-05');
  });

  it('"Next Monday" is a week out when today is already Monday', () => {
    expect(pauseStartDate('monday', '2026-10-05')).toBe('2026-10-12');
  });
});

describe('pauseEndDate', () => {
  it('is the last paused day (inclusive range)', () => {
    expect(pauseEndDate('2026-10-03', 1)).toBe('2026-10-09');
    expect(pauseEndDate('2026-10-05', 2)).toBe('2026-10-18');
  });
});

describe('pauseReasonLabel', () => {
  it('turns the stored enum into a label, never the raw value', () => {
    expect(pauseReasonLabel('vacation')).toBe('Vacation');
    expect(pauseReasonLabel('INJURY')).toBe('Injury');
    expect(pauseReasonLabel('burnout')).toBe('Burnout');
    expect(pauseReasonLabel(null)).toBeNull();
    expect(pauseReasonLabel('')).toBeNull();
  });
});

describe('pauseSummaryLine', () => {
  it('a running pause says "through", with human dates and the reason label', () => {
    expect(
      pauseSummaryLine(
        { startDate: '2026-10-02', endDate: '2026-10-08', reason: 'vacation' },
        '2026-10-03',
      ),
    ).toBe('Paused through Thu 8 Oct · Vacation');
  });

  it('an upcoming pause names when it starts and ends', () => {
    expect(
      pauseSummaryLine(
        { startDate: '2026-10-05', endDate: '2026-10-11', reason: null },
        '2026-10-03',
      ),
    ).toBe('Starts Mon 5 Oct, through Sun 11 Oct');
  });
});
