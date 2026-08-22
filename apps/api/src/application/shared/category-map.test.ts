import { describe, expect, it } from 'vitest';
import { inferCategory } from './category-map.js';

describe('inferCategory', () => {
  it('categorises plain ingredients', () => {
    expect(inferCategory('Chicken breast')).toBe('proteins');
    expect(inferCategory('Whole milk')).toBe('dairy');
    expect(inferCategory('Basmati rice')).toBe('grains');
    expect(inferCategory('Cherry tomato')).toBe('produce');
  });

  it('matches whole words, not substrings — the pepperoni bug', () => {
    // The old .includes() matching sent "pepperoni" to produce via "pepper".
    expect(inferCategory('Pepperoni')).toBe('proteins');
    expect(inferCategory('Bell pepper')).toBe('produce');
    // "peppercorn" contains "pepper" as a substring but not as a word.
    expect(inferCategory('Black peppercorn')).toBe('other');
  });

  it('does not send coconut to the nut aisle', () => {
    // Longest keyword wins: "coconut" (pantry) beats "milk" — canned coconut
    // milk lives in the pantry aisle, not the dairy fridge.
    expect(inferCategory('Coconut milk')).toBe('grains');
    expect(inferCategory('Coconut flakes')).toBe('grains');
    expect(inferCategory('Mixed nuts')).toBe('grains');
  });

  it('tolerates simple plurals', () => {
    expect(inferCategory('Carrots')).toBe('produce');
    expect(inferCategory('Eggs')).toBe('proteins');
  });

  it('is case-insensitive and falls back to other', () => {
    expect(inferCategory('SALMON FILLET')).toBe('proteins');
    expect(inferCategory('Xanthan gum')).toBe('other');
  });

  // ── prod-followups #7: 40 of 98 derived-list items landed in "Other" ──────
  // Names below are verbatim from the E2E prod sweep's shopping list.

  it('classifies the E2E sweep names that used to land in Other', () => {
    const expectations: Record<string, string> = {
      Blueberries: 'produce',
      Raspberries: 'produce',
      'Cherry tomatoes': 'produce',
      Courgette: 'produce',
      'Sweet potato': 'produce',
      'Mixed leaves': 'produce',
      'Fresh ginger': 'produce',
      'Green chili': 'produce',
      'Green peas': 'produce',
      Chives: 'produce',
      'Coriander leaves': 'produce',
      Halloumi: 'dairy',
      'Buckwheat groats': 'grains',
      'Corn tortillas': 'grains',
      'Whole wheat roti': 'grains',
      Granola: 'grains',
      'Chia seeds': 'grains',
      Tahini: 'grains',
      'Maple syrup': 'grains',
    };
    for (const [name, category] of Object.entries(expectations)) {
      expect({ name, category: inferCategory(name) }).toEqual({ name, category });
    }
  });

  it('handles -es and -ies plurals the old s? matcher missed (#7)', () => {
    expect(inferCategory('Tomatoes')).toBe('produce');
    expect(inferCategory('Potatoes')).toBe('produce');
    expect(inferCategory('Strawberries')).toBe('produce');
    expect(inferCategory('Anchovies')).toBe('proteins');
  });

  it('multi-word overrides outrank their fragments (#7)', () => {
    expect(inferCategory('Chili powder')).toBe('other'); // spice, not produce
    expect(inferCategory('Peanut butter')).toBe('grains'); // pantry, not dairy
    expect(inferCategory('Almond butter')).toBe('grains');
  });

  it('spices still fall back to other (#7)', () => {
    expect(inferCategory('Smoked paprika')).toBe('other');
    expect(inferCategory('Garam masala')).toBe('other');
  });
});
