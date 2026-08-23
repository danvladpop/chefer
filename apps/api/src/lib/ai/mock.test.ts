import { describe, expect, it } from 'vitest';
import { selectRebalanceSwaps } from '../../application/meal-plan/rebalance.js';
import { isRecipeSafe } from '../curated-recipes/safety.js';
import { WEEK_PLAN_FIXTURE } from './fixtures/week-plan.fixture.js';
import { MEAL_PHOTO_SCENARIOS, MockAIService } from './mock.js';
import type { ExtractedRecipe, MealPlanInput, RecipeData } from './types.js';

// ─── Scenario-steerable MockAIService (premium_plan.md §4.5) ─────────────────
// Two invariants: (1) with no steering keyword every method returns exactly
// its wave-1 default, so nothing that already worked changes; (2) each added
// scenario is reachable deterministically, so every AI branch can be driven
// in dev/Playwright without a live Gemini call.

const ai = new MockAIService();

/** ExtractedRecipe → RecipeData shim so the P1-2 matcher can run on it. */
const asRecipeData = (recipe: ExtractedRecipe): RecipeData => ({
  ...recipe,
  id: 'test',
  imageUrl: null,
});

const peanutAllergy = {
  allergies: ['peanuts'],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

const baseMealPlanInput: MealPlanInput = {
  userId: 'user-1',
  goal: 'MAINTAIN',
  biologicalSex: 'MALE',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'MODERATE',
  dailyCalorieTarget: 2000,
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
  cuisinePreferences: [],
  mealsPerDay: 4,
  servingSize: 1,
};

// ─── extractRecipe steering ──────────────────────────────────────────────────

describe('MockAIService.extractRecipe — keyword steering', () => {
  it('returns the unchanged pasta default when nothing steers', async () => {
    const recipe = await ai.extractRecipe({ text: 'my grandma’s weeknight dinner notes' });
    expect(recipe.name).toBe('Rustic Tomato Basil Pasta (imported via text)');
    expect(recipe.ingredients.map((i) => i.name)).toContain('spaghetti');
  });

  it('returns the pasta default for photo sources (no text to steer with)', async () => {
    const recipe = await ai.extractRecipe({ imageBase64: 'AAAA', mimeType: 'image/jpeg' });
    expect(recipe.name).toBe('Rustic Tomato Basil Pasta (imported via photo)');
  });

  it('steers "satay"/"peanut" to the allergen-bearing satay fixture', async () => {
    for (const text of ['best chicken satay recipe ever', 'spicy peanut noodles from the blog']) {
      const recipe = await ai.extractRecipe({ text });
      expect(recipe.name).toContain('Chicken Peanut Satay Skewers');
      expect(recipe.ingredients.map((i) => i.name)).toContain('peanut butter');
    }
  });

  it('steers via the url too, and reports via=link', async () => {
    const recipe = await ai.extractRecipe({
      url: 'https://blog.example.com/satay',
      text: 'stripped page body',
    });
    expect(recipe.name).toBe('Chicken Peanut Satay Skewers (imported via link)');
  });

  it('steers "beef" to the meaty fixture', async () => {
    const recipe = await ai.extractRecipe({ text: 'perfect beef steak, seared hard' });
    expect(recipe.name).toContain('Seared Beef Steak');
    expect(recipe.ingredients.map((i) => i.name)).toContain('beef sirloin steak');
  });

  it('steers "no-recipe" to the NO_RECIPE_FOUND sentinel', async () => {
    const recipe = await ai.extractRecipe({ text: 'this page is a no-recipe listicle' });
    expect(recipe.name).toBe('NO_RECIPE_FOUND');
    expect(recipe.ingredients).toHaveLength(0);
  });

  it('steers "unsafe" to the satay fixture carrying the UNSAFE magic name', async () => {
    const recipe = await ai.extractRecipe({ text: 'unsafe satay demo please' });
    expect(recipe.name).toMatch(/^UNSAFE Chicken Peanut Satay Skewers/);
  });
});

// ─── cheferizeRecipe: satay → allergen changes; UNSAFE → fail closed ─────────

describe('MockAIService.cheferizeRecipe', () => {
  it('satay fixture + peanut allergy → allergen change emitted and adapted recipe is P1-2 clean', async () => {
    const original = await ai.extractRecipe({ text: 'chicken satay' });
    // The un-adapted original must trip the matcher (that is the point of the fixture).
    expect(isRecipeSafe(asRecipeData(original), peanutAllergy)).toBe(false);

    const { adapted, changes } = await ai.cheferizeRecipe({
      recipe: original,
      targetServings: original.servings,
      preferences: peanutAllergy,
    });

    expect(changes.some((c) => c.kind === 'allergen')).toBe(true);
    expect(adapted.ingredients.map((i) => i.name)).not.toContain('peanut butter');
    // Re-validated the way the import service does: the P1-2 matcher agrees.
    expect(isRecipeSafe(asRecipeData(adapted), peanutAllergy)).toBe(true);
  });

  it('UNSAFE name → swaps are skipped and the P1-2 matcher fails the adapted recipe (fail closed)', async () => {
    const original = await ai.extractRecipe({ text: 'unsafe satay' });
    const { adapted, changes } = await ai.cheferizeRecipe({
      recipe: original,
      targetServings: original.servings,
      preferences: peanutAllergy,
    });

    // The mock "missed" the allergen on purpose…
    expect(adapted.ingredients.map((i) => i.name)).toContain('peanut butter');
    expect(changes.some((c) => c.kind === 'allergen')).toBe(false);
    // …and the safety net catches it: matcher says unsafe, exactly what the
    // recipe-import service re-validates before allowing a save.
    expect(isRecipeSafe(asRecipeData(adapted), peanutAllergy)).toBe(false);
  });

  it('still rescales servings in the UNSAFE scenario (only safety swaps are skipped)', async () => {
    const original = await ai.extractRecipe({ text: 'unsafe satay' }); // servings: 4
    const { adapted } = await ai.cheferizeRecipe({
      recipe: original,
      targetServings: 2,
      preferences: peanutAllergy,
    });
    expect(adapted.servings).toBe(2);
    const peanut = adapted.ingredients.find((i) => i.name === 'peanut butter');
    expect(peanut?.quantity).toBe(60); // 120 g × (2/4)
  });
});

// ─── analyzeMealPhoto: byte-derived scenarios ────────────────────────────────

describe('MockAIService.analyzeMealPhoto — scenario table', () => {
  // Base64 length % 5 picks the scenario. Lengths are multiples of 4, so the
  // residues cycle 4,3,2,1,0 as the length grows by 4.
  const base64OfResidue = (residue: number): string => {
    for (let len = 4; ; len += 4) {
      if (len % 5 === residue) return 'A'.repeat(len);
    }
  };

  it('keeps the wave-1 default estimate at residue 0', async () => {
    const estimate = await ai.analyzeMealPhoto(base64OfResidue(0), 'image/jpeg');
    expect(estimate).toEqual({
      dishName: 'Grilled chicken with rice and vegetables',
      confidence: 'med',
      kcal: 520,
      protein: 38,
      carbs: 55,
      fat: 14,
      portionNote: 'assuming a standard 350 g plate',
    });
  });

  it('reaches every scenario, covering all three confidence levels', async () => {
    const seen = new Set<string>();
    const confidences = new Set<string>();
    for (let residue = 0; residue < MEAL_PHOTO_SCENARIOS.length; residue++) {
      const estimate = await ai.analyzeMealPhoto(base64OfResidue(residue), 'image/jpeg');
      seen.add(estimate.dishName);
      confidences.add(estimate.confidence);
    }
    expect(seen.size).toBe(MEAL_PHOTO_SCENARIOS.length);
    expect([...confidences].sort()).toEqual(['high', 'low', 'med']);
  });

  it('is deterministic for the same image bytes', async () => {
    const bytes = base64OfResidue(2);
    const first = await ai.analyzeMealPhoto(bytes, 'image/jpeg');
    const second = await ai.analyzeMealPhoto(bytes, 'image/png');
    expect(second).toEqual(first);
  });

  it('residue 4 is the ≥1500 kcal feast that trips the rebalance threshold', async () => {
    const feast = await ai.analyzeMealPhoto(base64OfResidue(4), 'image/jpeg');
    expect(feast.kcal).toBeGreaterThanOrEqual(1500);
    expect(feast.confidence).toBe('low');

    // Logged on top of an on-target Monday (2000 kcal/day plan), the feast
    // projects the week past +15% and the selector actually swaps meals.
    const selection = selectRebalanceSwaps({
      todayIndex: 0,
      weeklyTargetKcal: 14_000,
      consumedKcal: 2000 + feast.kcal, // normal day fully logged + the feast
      futureSlots: [1, 2, 3, 4, 5, 6].map((day) => ({
        dayOfWeek: day,
        mealType: 'dinner',
        recipeId: `dinner-${day}`,
        recipeName: `Dinner ${day}`,
        kcal: 2000, // stands in for the whole remaining day
      })),
      candidatesByType: {
        dinner: [{ id: 'light-dinner', name: 'Light dinner', kcal: 700 }],
      },
    });
    expect(selection.projectedDeviation).toBeGreaterThan(0.15);
    expect(selection.swaps.length).toBeGreaterThan(0);
  });
});

// ─── generateMealPlan: wave-0 seam handling ──────────────────────────────────

describe('MockAIService.generateMealPlan — seam handling', () => {
  it('returns the untouched fixture when no seam field is set (frozen default)', async () => {
    const plan = await ai.generateMealPlan(baseMealPlanInput);
    expect(plan).toBe(WEEK_PLAN_FIXTURE); // same reference — byte-identical
  });

  it('householdContext.portionSum rescales every recipe exactly once', async () => {
    const plan = await ai.generateMealPlan({
      ...baseMealPlanInput,
      householdContext: {
        memberCount: 2,
        portionSum: 3,
        mergedSafety: { allergies: [], dietaryRestrictions: [] },
        dislikeNotes: [],
      },
    });

    const allRecipes = plan.days.flatMap((d) => d.meals.map((m) => m.recipe));
    expect(allRecipes.every((r) => r.servings === 3)).toBe(true);

    // The parfait is a 1-serving fixture (200 g yogurt) — scaled ×3 once,
    // even though structuredClone keeps recipe objects shared across days.
    const parfaits = allRecipes.filter((r) => r.name.includes('Greek Yogurt Parfait'));
    expect(parfaits.length).toBeGreaterThan(1); // it repeats in the fixture week
    for (const parfait of parfaits) {
      expect(parfait.ingredients.find((i) => i.name.includes('Greek yogurt'))?.quantity).toBe(600);
    }

    // The shared fixture itself was not mutated.
    const fixtureParfait = WEEK_PLAN_FIXTURE.days[0]?.meals[0]?.recipe;
    expect(fixtureParfait?.servings).not.toBe(3);
  });

  it('injects useFirstIngredients into successive dinners', async () => {
    const plan = await ai.generateMealPlan({
      ...baseMealPlanInput,
      useFirstIngredients: [
        { name: 'zucchini', quantity: 2, unit: 'piece', reason: 'bought last week' },
        { name: 'feta', quantity: 150, unit: 'g', reason: 'opens tomorrow' },
      ],
    });

    const dinners = plan.days.map((d) => d.meals.find((m) => m.type === 'dinner')?.recipe);
    expect(dinners[0]?.ingredients.some((i) => i.name === 'zucchini')).toBe(true);
    expect(dinners[1]?.ingredients.some((i) => i.name === 'feta')).toBe(true);

    // Fixture untouched: no pantry item leaked into the shared default.
    const fixtureIngredients = WEEK_PLAN_FIXTURE.days.flatMap((d) =>
      d.meals.flatMap((m) => m.recipe.ingredients.map((i) => i.name)),
    );
    expect(fixtureIngredients).not.toContain('zucchini');
    expect(fixtureIngredients).not.toContain('feta');
  });

  it('applies both seams together', async () => {
    const plan = await ai.generateMealPlan({
      ...baseMealPlanInput,
      householdContext: {
        memberCount: 1,
        portionSum: 2,
        mergedSafety: { allergies: [], dietaryRestrictions: [] },
        dislikeNotes: ['avoid mushrooms for Maria'],
      },
      useFirstIngredients: [
        { name: 'leftover rice', quantity: 300, unit: 'g', reason: 'cooked Sunday' },
      ],
    });
    const firstDinner = plan.days[0]?.meals.find((m) => m.type === 'dinner')?.recipe;
    expect(firstDinner?.servings).toBe(2);
    expect(firstDinner?.ingredients.some((i) => i.name === 'leftover rice')).toBe(true);
  });
});
