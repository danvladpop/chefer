import { describe, expect, it } from 'vitest';
import { CURATED_POOL_BY_TYPE, filterSafeRecipes } from './index.js';

// WP-14 (UX-PO-06): the free curated pool must carry multi-week plans for the
// common restricted diets. A recipe only counts for a diet when the
// ingredient-based safety check (WP-01, UX-REC-01) lets it through — tags alone
// don't. If a pool edit drops a diet below its floor, this fails and names it.

type Slot = 'breakfast' | 'lunch' | 'dinner';

const DIETS: Record<string, string[]> = {
  omnivore: [],
  vegetarian: ['Vegetarian'],
  vegan: ['Vegan'],
  pescatarian: ['Pescatarian'],
  'gluten-free': ['Gluten-free'],
  'dairy-free': ['Dairy-free'],
};

/** WP-14 targets: two weeks of dinners without repeats, 10 breakfasts and lunches. */
const FLOOR: Record<Slot, number> = { breakfast: 10, lunch: 10, dinner: 14 };

/** "As far as practical" for vegan + gluten-free: a floor that holds today. */
const VEGAN_GF_FLOOR: Record<Slot, number> = { breakfast: 8, lunch: 9, dinner: 14 };

function count(restrictions: string[], slot: Slot): number {
  return filterSafeRecipes(CURATED_POOL_BY_TYPE[slot], {
    allergies: [],
    dietaryRestrictions: restrictions,
    dislikedIngredients: [],
  }).length;
}

describe('curated pool covers the common diets (WP-14)', () => {
  for (const [diet, restrictions] of Object.entries(DIETS)) {
    it.each(['breakfast', 'lunch', 'dinner'] as const)(`${diet}: %s meets its floor`, (slot) => {
      expect(count(restrictions, slot)).toBeGreaterThanOrEqual(FLOOR[slot]);
    });
  }

  it.each(['breakfast', 'lunch', 'dinner'] as const)(
    'vegan + gluten-free: %s meets its floor',
    (slot) => {
      expect(count(['Vegan', 'Gluten-free'], slot)).toBeGreaterThanOrEqual(VEGAN_GF_FLOOR[slot]);
    },
  );

  it('has at least 12 Romanian staples', () => {
    const romanian = Object.values(CURATED_POOL_BY_TYPE)
      .flat()
      .filter((r) => r.cuisineType === 'Romanian');
    expect(romanian.length).toBeGreaterThanOrEqual(12);
  });
});
