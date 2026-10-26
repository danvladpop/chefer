import { describe, expect, it } from 'vitest';
import {
  barcodeSchema,
  isValidGtin,
  packagedProductDraftSchema,
  PRODUCT_ALLERGEN_IDS,
  productAmountSchema,
} from './packaged-product';

describe('isValidGtin / barcodeSchema', () => {
  it('accepts EAN-13, EAN-8, UPC-A and GTIN-14 with a correct check digit', () => {
    for (const code of ['3017620422003', '96385074', '036000291452', '10012345678902']) {
      expect(isValidGtin(code)).toBe(true);
    }
  });

  it('rejects a wrong check digit, letters and odd lengths', () => {
    for (const code of ['3017620422004', '30176204220a3', '1234567', '123456789']) {
      expect(isValidGtin(code)).toBe(false);
    }
  });

  it('drops spaces and dashes a user types', () => {
    expect(barcodeSchema.parse(' 3017-6204 22003 ')).toBe('3017620422003');
  });
});

describe('packagedProductDraftSchema', () => {
  const base = {
    barcode: null,
    name: 'Granola',
    brand: null,
    per100g: {
      kcal: 450,
      protein: 10,
      carbs: null,
      fat: null,
      fiber: null,
      sugar: null,
      saturatedFat: null,
      salt: null,
    },
    servingSizeG: null,
    allergens: { known: false, contains: [] },
  };

  it('needs calories but lets every other number be unknown', () => {
    expect(packagedProductDraftSchema.safeParse(base).success).toBe(true);
    expect(
      packagedProductDraftSchema.safeParse({ ...base, per100g: { ...base.per100g, kcal: null } })
        .success,
    ).toBe(false);
  });

  it('caps per-100 g values at what 100 g can physically hold', () => {
    expect(
      packagedProductDraftSchema.safeParse({ ...base, per100g: { ...base.per100g, kcal: 901 } })
        .success,
    ).toBe(false);
    expect(
      packagedProductDraftSchema.safeParse({ ...base, per100g: { ...base.per100g, protein: 101 } })
        .success,
    ).toBe(false);
  });

  it('allergens are taxonomy ids only', () => {
    expect(PRODUCT_ALLERGEN_IDS).toContain('sesame');
    expect(
      packagedProductDraftSchema.safeParse({
        ...base,
        allergens: { known: true, contains: ['sesame'] },
      }).success,
    ).toBe(true);
    expect(
      packagedProductDraftSchema.safeParse({
        ...base,
        allergens: { known: true, contains: ['kiwi'] },
      }).success,
    ).toBe(false);
  });
});

describe('productAmountSchema', () => {
  it('grams or servings, positive and bounded', () => {
    expect(productAmountSchema.safeParse({ unit: 'g', grams: 150 }).success).toBe(true);
    expect(productAmountSchema.safeParse({ unit: 'serving', servings: 1.5 }).success).toBe(true);
    expect(productAmountSchema.safeParse({ unit: 'g', grams: 0 }).success).toBe(false);
    expect(productAmountSchema.safeParse({ unit: 'serving', servings: 21 }).success).toBe(false);
  });
});
