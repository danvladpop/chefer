import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-40 slice 1 (T-40.3/T-40.4, D-19) against the REAL API through the app's
// own link stack. Registers ONE throwaway user per run (auth rate limit:
// 10 register/login per 15 min per IP — don't add more registrations here).
//
// Covers what the widened recipe.create/update inputs must still guarantee:
// - a fully-populated "level-0" payload (an installed client that predates
//   this widening, and so still sends every field it always sent) keeps
//   working unchanged;
// - the new D-19 minimum (name + one ingredient line) is enough on its own;
// - dietary tags and fiber — neither shown on the manual form any more, both
//   still stored — round-trip through an edit exactly as the app resends
//   them (T-BUG-O3 C2/C6).

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('recipe-form'),
    password: 'Contract@123!',
    ...CONTRACT_CONSENT,
    firstName: 'RecipeForm',
  });
  if (!user.session) {
    throw new Error('mobile register response is missing the session credential');
  }
  setToken(user.session.token);
});

// plan-ingredient-catalog D4: typed nutrition survives only while a line does
// not resolve to the ingredient catalog (USER_ENTERED); once every line
// resolves the server computes and ignores the typed numbers. These payloads
// use a name the catalog will never have, so they still prove the round-trip.
const UNRESOLVABLE = 'contract-only mystery flour';

/** The full shape an installed client from before T-40.3 always sent. */
function level0Payload(name: string) {
  return {
    name,
    description: 'A level-0 client always sent a description.',
    ingredients: [{ name: UNRESOLVABLE, quantity: 200, unit: 'g' }],
    instructions: ['Mix.', 'Bake.'],
    nutritionInfo: { calories: 300, protein: 10, carbs: 40, fat: 5, fiber: 3 },
    cuisineType: 'Italian',
    dietaryTags: [] as string[],
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
  };
}

describe('recipe.create/update — level-0 payload still works (AC1)', () => {
  it('a fully-populated old-shape payload creates and round-trips unchanged', async () => {
    const name = `Level-0 recipe ${Date.now()}`;
    const created = await client.recipe.create.mutate(level0Payload(name));
    expect(created.id).toBeTruthy();

    const fetched = await client.recipe.getMyRecipe.query({ recipeId: created.id });
    expect(fetched.name).toBe(name);
    expect(fetched.cuisineType).toBe('Italian');
    expect(fetched.servings).toBe(2);
    expect(fetched.ingredients).toEqual([{ name: UNRESOLVABLE, quantity: 200, unit: 'g' }]);
    const n = fetched.nutritionInfo as { fiber?: number };
    expect(n.fiber).toBe(3);
    expect(fetched.nutritionStatus).toBe('USER_ENTERED');
  });

  it('D4: when every line resolves to the catalog, the server computes and ignores typed numbers', async () => {
    const created = await client.recipe.create.mutate({
      ...level0Payload(`Level-0 computed ${Date.now()}`),
      ingredients: [{ name: 'olive oil', quantity: 10, unit: 'g' }],
      nutritionInfo: { calories: 999, protein: 99, carbs: 99, fat: 99, fiber: 9 },
    });
    expect(created.nutritionStatus).toBe('COMPUTED');
    // 10 g olive oil ≈ 88 kcal, ÷ 2 servings
    expect(created.nutritionInfo).toMatchObject({ calories: 44, fat: 5 });
    // the Json mirror an old client reads is exactly what it sent
    expect(created.ingredients).toEqual([{ name: 'olive oil', quantity: 10, unit: 'g' }]);
  });

  it('the same level-0 shape also updates successfully', async () => {
    const created = await client.recipe.create.mutate(
      level0Payload(`Level-0 update ${Date.now()}`),
    );
    const renamed = `Level-0 updated ${Date.now()}`;
    const payload = level0Payload(renamed);
    const updated = await client.recipe.update.mutate({ recipeId: created.id, ...payload });
    expect(updated.name).toBe(renamed);
  });
});

describe('recipe.create — D-19 minimum (AC1)', () => {
  it('a name and one ingredient line is enough, with sane defaults for everything else', async () => {
    const name = `D-19 minimum ${Date.now()}`;
    const created = await client.recipe.create.mutate({
      name,
      ingredients: [{ name: 'water', quantity: 500, unit: 'ml' }],
    });
    expect(created.id).toBeTruthy();

    const fetched = await client.recipe.getMyRecipe.query({ recipeId: created.id });
    expect(fetched.name).toBe(name);
    expect(fetched.description).toBe('');
    // T-40.3: an empty/omitted cuisine is stored as the existing "International" default.
    expect(fetched.cuisineType).toBe('International');
    expect(fetched.instructions).toEqual([]);
    expect(fetched.servings).toBe(1);
    expect(fetched.dietaryTags).toEqual([]);
    const n = fetched.nutritionInfo as { calories: number; fiber?: number };
    expect(n.calories).toBe(0);
    expect(n.fiber ?? 0).toBe(0);
  });

  it('rejects a recipe with no ingredients at all (the minimum still has a floor)', async () => {
    await expect(
      client.recipe.create.mutate({ name: 'No ingredients', ingredients: [] }),
    ).rejects.toThrow();
  });
});

describe('recipe.update — dietary tags and fiber round-trip (T-BUG-O3 C2/C6)', () => {
  it('re-sending the same tags and fiber on every update keeps both, unshown but intact', async () => {
    const created = await client.recipe.create.mutate({
      name: `Round trip ${Date.now()}`,
      ingredients: [{ name: UNRESOLVABLE, quantity: 100, unit: 'g' }],
      dietaryTags: ['vegan', 'gluten-free'],
      nutritionInfo: { calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 7 },
    });

    const first = await client.recipe.getMyRecipe.query({ recipeId: created.id });
    expect(first.dietaryTags).toEqual(['vegan', 'gluten-free']);
    const firstN = first.nutritionInfo as { fiber?: number };
    expect(firstN.fiber).toBe(7);

    // The manual form never shows fiber or re-derives tags — it resends
    // exactly what it fetched, changing only what the user actually edited
    // (here: the name).
    const newName = `Round trip renamed ${Date.now()}`;
    await client.recipe.update.mutate({
      recipeId: created.id,
      name: newName,
      description: first.description,
      ingredients: first.ingredients as { name: string; quantity: number; unit: string }[],
      instructions: first.instructions,
      nutritionInfo: first.nutritionInfo as {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
      },
      cuisineType: first.cuisineType,
      dietaryTags: first.dietaryTags,
      prepTimeMins: first.prepTimeMins,
      cookTimeMins: first.cookTimeMins,
      servings: first.servings,
      imageUrl: first.imageUrl ?? undefined,
    });

    const second = await client.recipe.getMyRecipe.query({ recipeId: created.id });
    expect(second.name).toBe(newName);
    expect(second.dietaryTags).toEqual(['vegan', 'gluten-free']);
    const secondN = second.nutritionInfo as { fiber?: number };
    expect(secondN.fiber).toBe(7);
  });
});
