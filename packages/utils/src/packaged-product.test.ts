import { describe, expect, it } from 'vitest';
import type { PackagedProductView } from '@chefer/types';
import {
  blankProductDraft,
  cleanBarcodeInput,
  parseProductForm,
  PRODUCT_ALLERGEN_PICKS,
  productAllergenLine,
  productAllergenWarningText,
  productAmountGrams,
  productDisplayName,
  productEntryName,
  productFormFromDraft,
  productMaxGrams,
  scaleProduct,
} from './packaged-product';

const per100g: PackagedProductView['per100g'] = {
  kcal: 539,
  protein: 6.3,
  carbs: 57.5,
  fat: 30.9,
  fiber: null,
  sugar: 56.3,
  saturatedFat: 10.6,
  salt: 0.11,
};

describe('productAmountGrams', () => {
  it('grams as given; servings × serving size; null without a serving size', () => {
    expect(productAmountGrams({ unit: 'g', grams: 40 }, null)).toBe(40);
    expect(productAmountGrams({ unit: 'serving', servings: 1.5 }, 15)).toBe(22.5);
    expect(productAmountGrams({ unit: 'serving', servings: 1 }, null)).toBeNull();
  });
});

describe('scaleProduct', () => {
  it('scales and rounds like the tracker stores entries', () => {
    expect(scaleProduct(per100g, 15)).toEqual({
      kcal: 81,
      protein: 0.9,
      carbs: 8.6,
      fat: 4.6,
      unknownMacros: [],
    });
  });

  it('flags missing macros and refuses a product without calories', () => {
    expect(scaleProduct({ ...per100g, carbs: null }, 100)?.unknownMacros).toEqual(['carbs']);
    expect(scaleProduct({ ...per100g, kcal: null }, 100)).toBeNull();
  });

  it('caps one entry at 5,000 kcal or 5 kg', () => {
    expect(productMaxGrams(per100g)).toBe(927);
    expect(productMaxGrams({ ...per100g, kcal: 20 })).toBe(5000);
  });
});

describe('names', () => {
  it('puts the brand first unless the name already starts with it', () => {
    expect(productDisplayName({ name: 'Oat Drink', brand: 'Oatly' })).toBe('Oatly Oat Drink');
    expect(productDisplayName({ name: 'Nutella', brand: 'Nutella' })).toBe('Nutella');
    expect(productDisplayName({ name: 'Granola', brand: null })).toBe('Granola');
  });

  it('names the entry with the amount', () => {
    const p = { name: 'Oat Drink', brand: 'Oatly' };
    expect(productEntryName(p, { unit: 'g', grams: 250 }, 250)).toBe('Oatly Oat Drink, 250 g');
    expect(productEntryName(p, { unit: 'serving', servings: 1 }, 250)).toBe(
      'Oatly Oat Drink, 1 serving (250 g)',
    );
    expect(productEntryName(p, { unit: 'serving', servings: 1.5 }, 22.5)).toBe(
      'Oatly Oat Drink, 1.5 servings (22.5 g)',
    );
  });
});

describe('allergen copy', () => {
  it('names who avoids it', () => {
    expect(
      productAllergenWarningText({
        allergenId: 'dairy',
        label: 'Dairy',
        kind: 'contains',
        who: ['you'],
      }),
    ).toBe('Contains dairy: you avoid it.');
    expect(
      productAllergenWarningText({
        allergenId: 'sesame',
        label: 'Sesame',
        kind: 'may-contain',
        who: ['Luca'],
      }),
    ).toBe('May contain sesame: Luca avoids it.');
    expect(
      productAllergenWarningText({
        allergenId: 'egg',
        label: 'Eggs',
        kind: 'contains',
        who: ['you', 'Maria', 'Luca'],
      }),
    ).toBe('Contains eggs: you, Maria and Luca avoid it.');
  });

  it('is honest when allergens are unknown or none are listed', () => {
    expect(productAllergenLine({ status: 'unknown', contains: [], mayContain: [] })).toMatch(
      /Allergens unknown/,
    );
    expect(productAllergenLine({ status: 'none-listed', contains: [], mayContain: [] })).toMatch(
      /No allergens listed/,
    );
    expect(
      productAllergenLine({
        status: 'listed',
        contains: [{ id: 'dairy', label: 'Dairy' }],
        mayContain: [{ id: 'peanuts', label: 'Peanuts' }],
      }),
    ).toBe('Contains: Dairy. May contain: Peanuts.');
  });
});

it('cleanBarcodeInput keeps digits only, at most 14', () => {
  expect(cleanBarcodeInput('3017 6204-22003 99999')).toBe('30176204220039');
});

describe('parseProductForm', () => {
  const numbers = {
    kcal: '450',
    protein: '10,5',
    carbs: '',
    fat: '',
    fiber: '',
    sugar: '',
    saturatedFat: '',
    salt: '',
  };
  const base = {
    barcode: null,
    name: 'Granola',
    brand: '  ',
    numbers,
    serving: '',
    contains: [],
    noneListed: false,
  };

  it('blank = not on the pack (null), commas read as decimals, blank brand is null', () => {
    const result = parseProductForm(base);
    expect(result.ok && result.draft).toMatchObject({
      brand: null,
      per100g: { kcal: 450, protein: 10.5, carbs: null },
      servingSizeG: null,
      allergens: { known: false, contains: [] },
    });
  });

  it('"None listed" makes allergens known; ticking one does too', () => {
    const none = parseProductForm({ ...base, noneListed: true });
    expect(none.ok && none.draft.allergens).toEqual({ known: true, contains: [] });
    const dairy = parseProductForm({ ...base, contains: ['dairy'] });
    expect(dairy.ok && dairy.draft.allergens).toEqual({ known: true, contains: ['dairy'] });
  });

  it('says exactly what to fix', () => {
    expect(parseProductForm({ ...base, numbers: { ...numbers, kcal: '' } })).toEqual({
      ok: false,
      error: 'Enter the calories per 100 g from the pack.',
    });
    expect(parseProductForm({ ...base, name: ' ' })).toMatchObject({ ok: false, error: /name/ });
    expect(parseProductForm({ ...base, numbers: { ...numbers, fat: '120' } })).toMatchObject({
      ok: false,
      error: /per 100 g/,
    });
    expect(parseProductForm({ ...base, numbers: { ...numbers, fat: 'abc' } }).ok).toBe(false);
  });

  it('round-trips a draft through the form', () => {
    const draft = blankProductDraft('96385074');
    expect(productFormFromDraft(draft)).toMatchObject({
      barcode: '96385074',
      name: '',
      serving: '',
    });
    expect(PRODUCT_ALLERGEN_PICKS.map((a) => a.id)).not.toContain('shellfish');
  });
});
