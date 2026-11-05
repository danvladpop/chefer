import { describe, expect, it } from 'vitest';
import { createTranslator } from '@chefer/i18n';
import { allergenLine, allergenWarningText } from './ProductCard';

// Lane J: the allergen lines a product card shows, in both languages.

const en = createTranslator('en').t;
const ro = createTranslator('ro').t;

describe('allergenWarningText', () => {
  it('keeps the English sentence and its verb agreement', () => {
    expect(
      allergenWarningText(en, {
        allergenId: 'milk',
        label: 'Dairy',
        kind: 'contains',
        who: ['you', 'Maria'],
      }),
    ).toBe('Contains dairy: you and Maria avoid it.');
    expect(
      allergenWarningText(en, {
        allergenId: 'sesame',
        label: 'Sesame',
        kind: 'may-contain',
        who: ['Luca'],
      }),
    ).toBe('May contain sesame: Luca avoids it.');
  });

  it('writes the warning in Romanian, with "you" translated', () => {
    expect(
      allergenWarningText(ro, {
        allergenId: 'milk',
        label: 'Lactate',
        kind: 'contains',
        who: ['you', 'Maria'],
      }),
    ).toBe('Conține lactate — de evitat pentru tine și Maria.');
  });
});

describe('allergenLine', () => {
  it('is honest about unknown allergens in Romanian', () => {
    expect(allergenLine(ro, { status: 'unknown', contains: [], mayContain: [] })).toBe(
      'Alergeni necunoscuți — verifică ambalajul.',
    );
    expect(
      allergenLine(ro, {
        status: 'listed',
        contains: [{ id: 'gluten', label: 'Gluten' }],
        mayContain: [{ id: 'nuts', label: 'Nuts' }],
      }),
    ).toBe('Conține: Gluten. Poate conține: Nuts.');
  });
});
