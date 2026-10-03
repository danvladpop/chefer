import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX_LENGTH, feedbackCounter } from './feedback';
import { formatNumber } from './format';

describe('feedbackCounter (F-PROF-2-2)', () => {
  it('counts up against the API cap with thousands separators', () => {
    expect(feedbackCounter(0)).toEqual({
      label: `0 / ${formatNumber(2000)}`,
      tone: 'normal',
      remaining: 2000,
    });
    expect(feedbackCounter(1234).label).toBe(`${formatNumber(1234)} / ${formatNumber(2000)}`);
  });

  it('turns amber within 100 characters of the cap', () => {
    expect(feedbackCounter(1899).tone).toBe('normal');
    expect(feedbackCounter(1900).tone).toBe('near');
  });

  it('says so when the limit is reached', () => {
    expect(feedbackCounter(FEEDBACK_MAX_LENGTH)).toEqual({
      label: `Limit reached: ${formatNumber(2000)} characters`,
      tone: 'limit',
      remaining: 0,
    });
  });
});
