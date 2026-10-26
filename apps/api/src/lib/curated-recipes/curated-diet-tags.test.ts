import { describe, expect, it } from 'vitest';
import { CURATED_POOL_BY_TYPE } from './index.js';
import { CURATED_DIET_TAGS, deriveCuratedDietTags } from './safety-profile.js';
import { evaluateRestriction } from './safety.js';

// Market review F2: the pool filters diets strictly — a diet admits a recipe
// only when it carries the tag AND its ingredients are clean. An authored
// recipe that is clean for a diet but lacks its tag is silently hidden from
// that diet, so every diet the ingredients prove must be admitted by the
// stored tags. Checked on the served recipe (computed nutrition, which keto
// reads), against the strict rule, so a vegan tag counts for egg-free.

const SERVED = Object.values(CURATED_POOL_BY_TYPE).flat();

/**
 * Diets the matcher "proves" only because it misreads a line. Tagging these
 * would serve the dish to people who cannot eat it, so they stay untagged
 * until the matcher reads the line (then delete the entry).
 */
const MATCHER_MISSES: Record<string, string> = {
  'curated-cur-l-103: vegan': 'tzatziki is yogurt',
  'curated-cur-l-103: dairy-free': 'tzatziki is yogurt',
  'curated-cur-l-108: vegan': 'mozzarella is not read as dairy',
  'curated-cur-l-108: dairy-free': 'mozzarella is not read as dairy',
  'curated-cur-l-112: vegan': 'halloumi is not read as dairy',
  'curated-cur-l-112: dairy-free': 'halloumi is not read as dairy',
  'curated-cur-l-109: gluten-free': 'miso is often barley-based',
  'curated-cur-d-103: gluten-free': 'falafel often carries wheat flour',
  'curated-cur-d-107: gluten-free': '"wholewheat spaghetti" is not read as wheat',
  'curated-fix-r-005: egg-free': 'Caesar dressing is egg-based',
  'curated-fix-r-013: vegetarian': '"protein powder" may be whey, egg or gelatine based',
  'curated-fix-r-013: vegan': '"protein powder" may be whey, egg or gelatine based',
  'curated-fix-r-013: egg-free': '"protein powder" may be egg-white based',
  'curated-cur-s-104: vegan': 'dark chocolate often carries milk',
  'curated-cur-s-104: dairy-free': 'dark chocolate often carries milk',
  'curated-cur-s-104: paleo': 'dark chocolate is sweetened with sugar',
};

/**
 * Claimed tags the ingredients disprove, left for the owner to settle (tags
 * are never removed without asking). Each excludes the dish from that diet.
 */
const DISPROVEN_CLAIMS: Record<string, string> = {
  'curated-swap-b-001: gluten-free': 'rolled oats fail gluten-free by design (cross-contamination)',
  'curated-swap-l-001: vegan': 'matcher reads "minced garlic" as mince',
  'curated-cur-b-110: vegan': 'matcher reads "coconut yogurt" as dairy',
  'curated-cur-b-110: dairy-free': 'matcher reads "coconut yogurt" as dairy',
  'curated-cur-d-111: gluten-free': 'matcher reads "Courgette Noodle" as noodles',
};

const strictlyAdmits = (recipe: (typeof SERVED)[number], diet: string) =>
  evaluateRestriction(recipe, diet)?.status === 'pass';

describe('curated diet tags match what the ingredients prove', () => {
  it('admits every recipe to every diet its ingredients prove', () => {
    const missing = SERVED.flatMap((recipe) =>
      deriveCuratedDietTags(recipe)
        .filter((diet) => !strictlyAdmits(recipe, diet))
        .map((diet) => `${recipe.id}: ${diet}`),
    ).filter((key) => !(key in MATCHER_MISSES));
    expect(missing).toEqual([]);
  });

  it('claims no diet tag the ingredients disprove beyond the known list', () => {
    const disproven = SERVED.flatMap((recipe) =>
      recipe.dietaryTags
        .filter((t) => (CURATED_DIET_TAGS as readonly string[]).includes(t))
        .filter((diet) => !strictlyAdmits(recipe, diet))
        .map((diet) => `${recipe.id}: ${diet}`),
    ).filter((key) => !(key in DISPROVEN_CLAIMS));
    expect(disproven).toEqual([]);
  });
});
