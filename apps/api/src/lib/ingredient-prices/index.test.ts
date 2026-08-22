import { describe, expect, it } from 'vitest';
import { estimateItemPriceEur, quantityToGrams } from './index.js';

// Regression tests for prod-followups #3: comma-qualified units fell back to
// count×1 ("100 g, dry" of lentils → 100 pieces → €52.50) and tiny-amount
// units were counted as pieces ("1 pinch" of saffron → €22.50).

const LENTILS = { pricePer100gEur: 0.35, pricePer100mlEur: null, pricePerPieceEur: null };
const SAFFRON = { pricePer100gEur: 300, pricePer100mlEur: null, pricePerPieceEur: null };
const ONION = { pricePer100gEur: 0.1, pricePer100mlEur: null, pricePerPieceEur: 0.35 };

describe('estimateItemPriceEur — qualified units (#3)', () => {
  it("parses 'g, dry' as grams — the €52.50 lentils bug", () => {
    expect(estimateItemPriceEur(LENTILS, 100, 'g, dry')).toBe(0.35);
    // identical to the clean unit
    expect(estimateItemPriceEur(LENTILS, 100, 'g')).toBe(0.35);
  });

  it('parses other fixture qualifiers seen in the curated pool', () => {
    expect(estimateItemPriceEur(LENTILS, 200, 'g, thinly sliced')).toBe(0.7);
    expect(estimateItemPriceEur(LENTILS, 160, 'g (dry)')).toBe(0.56);
    // "medium, diced" → one medium piece, not a count-1 mystery unit
    expect(estimateItemPriceEur(ONION, 1, 'medium, diced')).toBe(
      estimateItemPriceEur(ONION, 1, 'medium'),
    );
  });

  it("prices 'pinch' as ~0.3 g of mass — the €22.50 saffron bug", () => {
    const pinch = estimateItemPriceEur(SAFFRON, 1, 'pinch');
    expect(pinch).not.toBeNull();
    expect(pinch!).toBeLessThan(2); // was 22.50
    expect(pinch!).toBeGreaterThan(0);
  });

  it("prices 'to taste' and 'dash' as tiny mass amounts", () => {
    expect(estimateItemPriceEur(SAFFRON, 1, 'to taste')!).toBeLessThan(2);
    expect(estimateItemPriceEur(SAFFRON, 1, 'dash')!).toBeLessThan(3);
  });

  it('bare prep words still mean one piece', () => {
    expect(estimateItemPriceEur(ONION, 1, 'halved')).toBe(0.35);
    expect(estimateItemPriceEur(ONION, 2, 'pitted')).toBe(0.7);
  });
});

describe('quantityToGrams — qualified units (#3)', () => {
  it('mass qualifiers convert to real grams', () => {
    expect(quantityToGrams(100, 'g, dry', null)).toBe(100);
    expect(quantityToGrams(1, 'kg', null)).toBe(1000);
  });

  it('a pinch is a fraction of a gram, not 7.5 g of spice', () => {
    expect(quantityToGrams(1, 'pinch', null)!).toBeLessThan(1);
  });
});
