import { describe, expect, it } from 'vitest';
import { unsafeForTableMessage } from './friends-errors.js';

// UX-PLAN-06: the rejection reads "isn't paleo (it contains quinoa)", never
// "contains Paleo"; allergen wording and the UNSAFE_FOR_TABLE prefix are unchanged.
describe('unsafeForTableMessage', () => {
  it('words a diet as what the dish is not, naming the offending ingredient', () => {
    const message = unsafeForTableMessage(['Paleo'], {
      diets: ['Paleo'],
      ingredients: { Paleo: ['quinoa', 'black beans'] },
    });
    expect(message).toBe(
      "UNSAFE_FOR_TABLE: this recipe isn't paleo (it contains quinoa, black beans), which conflicts with a diet set for your table.",
    );
    expect(message).not.toMatch(/contains Paleo/);
  });

  it('keeps the allergen wording exactly', () => {
    expect(unsafeForTableMessage(['Peanuts'], { diets: ['Paleo'] })).toBe(
      'UNSAFE_FOR_TABLE: this recipe contains Peanuts, which conflicts with an allergy or dietary restriction set for your table.',
    );
    expect(unsafeForTableMessage(['Peanuts'])).toMatch(/^UNSAFE_FOR_TABLE: this recipe contains /);
  });

  it('copes with a diet whose ingredients are unknown (a limit, or an unverifiable recipe)', () => {
    expect(unsafeForTableMessage(['Keto'], { diets: ['Keto'] })).toBe(
      "UNSAFE_FOR_TABLE: this recipe isn't keto, which conflicts with a diet set for your table.",
    );
  });
});
