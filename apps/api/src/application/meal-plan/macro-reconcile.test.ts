import { describe, expect, it } from 'vitest';
import { roundQuantity } from './macro-reconcile.js';

describe('roundQuantity', () => {
  it('rounds to what a cook would measure', () => {
    expect(roundQuantity(323.9, 'g')).toBe(325);
    expect(roundQuantity(7.4, 'g')).toBe(7);
    expect(roundQuantity(1.3, 'tbsp')).toBe(1.25);
    expect(roundQuantity(0.3, 'piece')).toBe(0.5);
  });
});
