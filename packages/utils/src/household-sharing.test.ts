import { describe, expect, it } from 'vitest';
import { householdPortionPhrase } from './household-sharing';

describe('householdPortionPhrase', () => {
  it('reads as words inside "You eat … of each meal"', () => {
    expect(householdPortionPhrase(1)).toBe('a standard portion');
    expect(householdPortionPhrase(0.5)).toBe('half a portion');
    expect(householdPortionPhrase(0.75)).toBe('three-quarters of a portion');
    expect(householdPortionPhrase(1.25)).toBe('1¼ portions');
    expect(householdPortionPhrase(1.5)).toBe('1½ portions');
  });

  it('falls back to the number for an unusual factor', () => {
    expect(householdPortionPhrase(1.1)).toBe('1.1 portions');
    expect(householdPortionPhrase(0.6)).toBe('0.6 of a portion');
  });
});
