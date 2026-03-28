// ─── Recipe Image Picker ───────────────────────────────────────────────────────
// Assigns a relevant Unsplash image to AI-generated recipes, which always
// return imageUrl: null.
//
// Strategy:
//   1. Scan the recipe name for known food keywords → pick from that bucket.
//   2. Fall back to the meal type bucket.
//   3. Final fallback: the global food-spread photo.
//
// All photo IDs are verified against the Unsplash CDN (same stable IDs used
// in the mock fixture). A deterministic hash of the recipe id selects from
// multi-photo buckets, giving variety without randomness.

const BASE = 'https://images.unsplash.com';
const QS = '?auto=format&fit=crop&w=800&h=600&q=80';
const u = (id: string) => `${BASE}/${id}${QS}`;

// ─── Verified photo IDs (sourced from week-plan.fixture.ts) ──────────────────

const P = {
  yogurtParfait: 'photo-1542691457-cbe4df041eb2',
  avocadoToast: 'photo-1525351484163-7529414344d8',
  overnightOats: 'photo-1541809570-cce873416d94',
  omelette: 'photo-1609272270052-5aa27050b578',
  caesarSalad: 'photo-1550304943-4f24f54ddde9',
  quinoaBowl: 'photo-1512621776951-a57141f2eefd',
  turkeyWrap: 'photo-1626700051175-6818013e1d4f',
  salmon: 'photo-1467003909585-2f8a72700288',
  chickenStirFry: 'photo-1628025114288-1693ac3bcac1',
  mediterraneanFish: 'photo-1656945764473-6157c129817e',
  curry: 'photo-1585937421612-70a008356fbe',
  appleSlices: 'photo-1580062760649-1250019c0623',
  smoothie: 'photo-1650265929240-fbf163e0d003',
  nutsAndDates: 'photo-1769255484646-16988ad5552d',
  generalFood: 'photo-1490645935967-10de6ba17061', // global fallback
} as const;

// ─── Keyword → photo ID buckets ──────────────────────────────────────────────
// Each entry: [keywords, photoIds].  Keywords are matched against the
// lower-cased recipe name.  PhotoIds can have one or several entries —
// the hash picker selects among them so the same type looks varied.

const KEYWORD_BUCKETS: ReadonlyArray<[string[], string[]]> = [
  [
    ['yogurt', 'parfait', 'granola'],
    [P.yogurtParfait, P.overnightOats],
  ],
  [['avocado'], [P.avocadoToast, P.quinoaBowl]],
  [
    ['oat', 'porridge', 'overnight', 'muesli'],
    [P.overnightOats, P.yogurtParfait],
  ],
  [
    ['omelette', 'omelet', 'frittata', 'scramble', 'fried egg', 'poached egg'],
    [P.omelette, P.avocadoToast],
  ],
  [
    ['pancake', 'waffle', 'crepe', 'french toast'],
    [P.avocadoToast, P.omelette],
  ],
  [
    ['smoothie', 'shake', 'blend', 'juice'],
    [P.smoothie, P.yogurtParfait],
  ],
  [['caesar', 'romaine'], [P.caesarSalad]],
  [
    ['salad', 'slaw', 'tabbouleh', 'fattoush'],
    [P.quinoaBowl, P.caesarSalad],
  ],
  [
    ['bowl', 'buddha', 'grain bowl', 'rice bowl', 'poke'],
    [P.quinoaBowl, P.chickenStirFry],
  ],
  [['wrap', 'burrito', 'fajita', 'tortilla', 'quesadilla'], [P.turkeyWrap]],
  [
    ['sandwich', 'toast', 'bruschetta', 'crostini', 'baguette'],
    [P.avocadoToast, P.turkeyWrap],
  ],
  [
    ['taco', 'nacho', 'enchilada', 'mexican'],
    [P.turkeyWrap, P.caesarSalad],
  ],
  [
    ['salmon', 'trout', 'halibut', 'seabass', 'sea bass'],
    [P.salmon, P.mediterraneanFish],
  ],
  [
    ['cod', 'haddock', 'tilapia', 'bream', 'snapper'],
    [P.mediterraneanFish, P.salmon],
  ],
  [
    ['tuna', 'sardine', 'anchovy', 'mackerel'],
    [P.salmon, P.mediterraneanFish],
  ],
  [
    ['shrimp', 'prawn', 'lobster', 'crab', 'seafood', 'scallop', 'mussel', 'clam'],
    [P.mediterraneanFish, P.salmon],
  ],
  [
    ['chicken', 'poultry', 'turkey breast'],
    [P.chickenStirFry, P.caesarSalad],
  ],
  [['stir.?fry', 'wok', 'teriyaki', 'pad thai', 'fried rice'], [P.chickenStirFry]],
  [
    ['sushi', 'sashimi', 'maki', 'nigiri', 'ramen', 'udon', 'noodle', 'pho', 'dumpling'],
    [P.chickenStirFry, P.salmon],
  ],
  [['curry', 'dal', 'dhal', 'tikka', 'masala', 'korma', 'biryani', 'saag'], [P.curry]],
  [
    ['lentil', 'chickpea', 'hummus', 'falafel'],
    [P.curry, P.quinoaBowl],
  ],
  [
    ['pasta', 'spaghetti', 'penne', 'fettuccine', 'rigatoni', 'linguine', 'lasagna', 'gnocchi'],
    [P.chickenStirFry, P.generalFood],
  ],
  [
    ['soup', 'bisque', 'chowder', 'broth', 'consommé', 'minestrone', 'gazpacho'],
    [P.curry, P.generalFood],
  ],
  [
    ['stew', 'casserole', 'ragù', 'ragu', 'tagine', 'chili', 'chilli'],
    [P.curry, P.chickenStirFry],
  ],
  [
    ['beef', 'steak', 'burger', 'meatball', 'meatloaf', 'bolognese', 'brisket', 'lamb'],
    [P.chickenStirFry, P.generalFood],
  ],
  [
    ['pork', 'bacon', 'ham', 'sausage', 'chorizo', 'prosciutto'],
    [P.generalFood, P.chickenStirFry],
  ],
  [['nut', 'almond', 'walnut', 'cashew', 'pistachio', 'date', 'dried fruit'], [P.nutsAndDates]],
  [
    ['apple', 'pear', 'peach', 'plum', 'mango', 'papaya', 'kiwi', 'melon', 'grape'],
    [P.appleSlices],
  ],
  [
    ['berry', 'strawberr', 'blueberr', 'raspberr', 'blackberr'],
    [P.yogurtParfait, P.appleSlices],
  ],
];

// Fallback buckets by meal type when no keyword matches
const MEAL_TYPE_FALLBACKS: Record<string, string[]> = {
  breakfast: [P.avocadoToast, P.overnightOats, P.yogurtParfait, P.omelette],
  lunch: [P.quinoaBowl, P.caesarSalad, P.turkeyWrap],
  dinner: [P.salmon, P.chickenStirFry, P.curry, P.mediterraneanFish],
  snack: [P.appleSlices, P.smoothie, P.nutsAndDates],
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a stable Unsplash image URL for a recipe.
 * The hash of `recipeId` determines which photo is picked from the matched
 * bucket, so the same recipe always gets the same image across regenerations.
 */
export function pickRecipeImage(recipeId: string, recipeName: string, mealType: string): string {
  const name = recipeName.toLowerCase();

  for (const [keywords, photoIds] of KEYWORD_BUCKETS) {
    const matched = keywords.some((kw) => {
      // Support basic regex patterns (e.g. 'stir.?fry')
      try {
        return new RegExp(kw).test(name);
      } catch {
        return name.includes(kw);
      }
    });

    if (matched) {
      return u(photoIds[stableHash(recipeId) % photoIds.length]!);
    }
  }

  // Meal-type fallback
  const bucket = MEAL_TYPE_FALLBACKS[mealType] ?? MEAL_TYPE_FALLBACKS['dinner']!;
  return u(bucket[stableHash(recipeId) % bucket.length]!);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic, non-negative hash of a string. */
function stableHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
