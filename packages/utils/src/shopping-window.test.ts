import { describe, expect, it } from 'vitest';
import { shoppingWindowLabel } from './shopping-window';

describe('shoppingWindowLabel', () => {
  it('labels the remaining days of a mid-week plan', () => {
    expect(shoppingWindowLabel(4)).toBe('Fri–Sun');
    expect(shoppingWindowLabel(6)).toBe('Sun only');
  });
  it('is null for a whole-week list', () => {
    expect(shoppingWindowLabel(undefined)).toBeNull();
    expect(shoppingWindowLabel(0)).toBeNull();
  });
});
