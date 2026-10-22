import { describe, expect, it } from 'vitest';
import { mapOffAllergenTags, normaliseOffProduct } from './normalise.js';

describe('mapOffAllergenTags', () => {
  it('maps the EU-14 OFF tags onto Chefer taxonomy ids, once each', () => {
    expect(
      mapOffAllergenTags(['en:milk', 'en:nuts', 'en:gluten', 'en:wheat', 'en:sesame-seeds']),
    ).toEqual(['dairy', 'tree-nuts', 'gluten', 'sesame']);
  });

  it('drops tags outside the taxonomy and junk values', () => {
    expect(mapOffAllergenTags(['en:kiwi', 42, null, 'EN:SOYBEANS '])).toEqual(['soy']);
    expect(mapOffAllergenTags(undefined)).toEqual([]);
  });
});

describe('normaliseOffProduct', () => {
  it('reads a complete product per 100 g', () => {
    const p = normaliseOffProduct('3017620422003', {
      product_name: 'Nutella',
      brands: 'Ferrero, Nutella',
      nutriments: {
        'energy-kcal_100g': 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        fiber_100g: '3,4',
        sugars_100g: 56.3,
        'saturated-fat_100g': 10.6,
        salt_100g: 0.107,
      },
      serving_quantity: '15',
      serving_quantity_unit: 'g',
      allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'],
      traces_tags: ['en:milk', 'en:peanuts'],
      image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
    });
    expect(p).toMatchObject({
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      kcalPer100g: 539,
      fiberPer100g: 3.4,
      saltPer100g: 0.11,
      servingSizeG: 15,
      allergenTags: ['dairy', 'tree-nuts', 'soy'],
      // a trace already listed as "contains" is not repeated
      traceTags: ['peanuts'],
      allergensKnown: true,
      imageUrl: 'https://images.openfoodfacts.org/x.jpg',
    });
  });

  it('keeps missing values null (never 0) and derives kcal only from kJ', () => {
    const p = normaliseOffProduct('12345670', {
      product_name: '  Plain   crackers ',
      nutriments: { 'energy-kj_100g': 1674, fat_100g: 'n/a' },
    });
    expect(p.name).toBe('Plain crackers');
    expect(p.kcalPer100g).toBe(400);
    expect(p.fatPer100g).toBeNull();
    expect(p.proteinPer100g).toBeNull();
    expect(p.servingSizeG).toBeNull();
    expect(p.brand).toBeNull();
  });

  it('says allergens are unknown when OFF neither lists any nor has the ingredients', () => {
    expect(normaliseOffProduct('12345670', { product_name: 'X' }).allergensKnown).toBe(false);
    expect(
      normaliseOffProduct('12345670', { product_name: 'X', states_tags: ['en:ingredients-completed'] })
        .allergensKnown,
    ).toBe(true);
  });

  it('names an unnamed product by its barcode and refuses absurd numbers', () => {
    const p = normaliseOffProduct('12345670', {
      nutriments: { 'energy-kcal_100g': 99999, proteins_100g: -3 },
      serving_quantity: 30,
      serving_quantity_unit: 'oz',
      image_front_small_url: 'http://insecure.example/x.jpg',
    });
    expect(p.name).toBe('Product 12345670');
    expect(p.kcalPer100g).toBeNull();
    expect(p.proteinPer100g).toBeNull();
    expect(p.servingSizeG).toBeNull();
    expect(p.imageUrl).toBeNull();
  });
});
