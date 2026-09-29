import { describe, expect, it } from 'vitest';
import { homeCardOrder } from './home-cards';

describe('homeCardOrder', () => {
  it('TRACK users get ring, Quick add, Snap first, at every hour', () => {
    expect(homeCardOrder(['TRACK', 'PLAN_MEALS'])).toEqual([
      'ring',
      'quickAdd',
      'snap',
      'planToday',
    ]);
  });

  it('non-TRACK users get only their job cards, in job order', () => {
    expect(homeCardOrder(['TRAIN', 'HOUSEHOLD'])).toEqual(['workout', 'household']);
  });

  it('dedupes and skips jobs with no card', () => {
    expect(homeCardOrder(['TRAIN', 'TRAIN'])).toEqual(['workout']);
  });

  it('is empty for an empty jobs list', () => {
    expect(homeCardOrder([])).toEqual([]);
  });
});
