import { describe, expect, it } from 'vitest';
import { formatPriceRange, priceRange } from './price-range';

describe('priceRange', () => {
  it('applies the +/-15% band', () => {
    expect(priceRange(20)).toEqual({ lowEur: 17, highEur: 23 });
  });

  it('never goes below 0', () => {
    expect(priceRange(1)?.lowEur).toBe(0.85);
  });

  it('is null for an unknown price', () => {
    expect(priceRange(null)).toBeNull();
    expect(priceRange(undefined)).toBeNull();
  });
});

describe('formatPriceRange', () => {
  it('formats a EUR range per currency', () => {
    expect(formatPriceRange(20, 'EUR')).toMatch(/17.*23|17.*–.*23/);
  });

  it('is null for an unknown price', () => {
    expect(formatPriceRange(null, 'EUR')).toBeNull();
  });
});
