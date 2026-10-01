import { beforeAll, describe, expect, it } from 'vitest';
import {
  computeRecipeNutrition,
  isUnitUsableForIngredient,
  nutritionIngredientFromDetail,
} from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// plan-ingredient-catalog §10 (P9, mobile) against the REAL API through the
// app's own link stack: the procedures the recipe form, the private-
// ingredient sheet and the recipe detail now depend on. One throwaway user
// (auth rate limit — don't add registrations here).
//
// The headline check is parity: the form's live preview (the shared engine
// over `ingredients.getMany`) must equal what the server stores on save.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('ingredient-catalog'),
    password: 'Contract@123!',
    ...CONTRACT_CONSENT,
    firstName: 'Catalog',
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

async function pick(
  query: string,
  category?: Parameters<typeof client.ingredients.search.query>[0]['category'],
) {
  const rows = await client.ingredients.search.query({ query, ...(category ? { category } : {}) });
  const row = rows.find((r) => r.id);
  if (!row?.id) throw new Error(`catalog has no row for "${query}"`);
  return row as typeof row & { id: string };
}

describe('ingredients.search — catalog rows the picker links to', () => {
  it('rows carry id, category, portions and density; a category narrows the search', async () => {
    const egg = await pick('egg', 'EGG');
    expect(egg.category).toBe('EGG');
    expect(egg.owner).toBe('global');
    expect(egg.portions?.some((p) => p.unit === 'piece' || p.unit === 'large')).toBe(true);
    expect(typeof egg.hasDensity).toBe('boolean');

    const fruitOnly = await client.ingredients.search.query({ query: 'egg', category: 'FRUIT' });
    expect(fruitOnly.every((r) => r.category === 'FRUIT')).toBe(true);
  });
});

describe('live preview == server truth (I1 for the mobile form)', () => {
  it('the shared engine over getMany computes exactly what recipe.create stores', async () => {
    const egg = await pick('egg', 'EGG');
    const flour = await pick('wheat flour');
    const lines = [
      { name: egg.displayName, quantity: 2, unit: 'piece', ingredientId: egg.id },
      { name: flour.displayName, quantity: 150, unit: 'g', ingredientId: flour.id },
    ];
    const details = await client.ingredients.getMany.query({ ids: [egg.id, flour.id] });
    const lookup = new Map(details.map((d) => [d.id, nutritionIngredientFromDetail(d)]));
    const preview = computeRecipeNutrition(lines, lookup, 2);
    expect(preview.status).toBe('COMPUTED');

    const created = await client.recipe.create.mutate({
      name: `Catalog parity ${Date.now()}`,
      ingredients: lines,
      servings: 2,
      // What the app sends: its own preview, marked computed (ignored by the server).
      nutritionInfo: { ...preview.perServing, source: 'computed' },
    });
    expect(created.nutritionStatus).toBe('COMPUTED');
    expect(created.nutritionInfo).toMatchObject(preview.perServing);

    // Edit prefill: stored lines come back linked.
    const mine = await client.recipe.getMyRecipe.query({ recipeId: created.id });
    expect(mine.lines.map((l) => l.ingredientId)).toEqual([egg.id, flour.id]);

    // Recipe detail: the per-line breakdown behind "Computed from 2 ingredients".
    const detail = await client.mealPlan.getRecipe.query({ recipeId: created.id });
    expect(detail.nutritionStatus).toBe('COMPUTED');
    expect(detail.nutritionLines?.map((l) => l.ingredientId)).toEqual([egg.id, flour.id]);
    expect(detail.nutritionLines?.every((l) => l.grams !== null && l.facts !== null)).toBe(true);
  });

  it('a unit the row cannot weigh is PARTIAL on both sides (the picker never offers it)', async () => {
    const flour = await pick('wheat flour');
    expect(
      isUnitUsableForIngredient('clove', {
        portions: flour.portions ?? [],
        hasDensity: flour.hasDensity ?? false,
      }),
    ).toBe(false);
    const created = await client.recipe.create.mutate({
      name: `Catalog partial ${Date.now()}`,
      ingredients: [
        { name: flour.displayName, quantity: 2, unit: 'clove', ingredientId: flour.id },
      ],
      servings: 1,
    });
    expect(created.nutritionStatus).toBe('PARTIAL');
  });
});

describe('ingredients.createCustom — the private-ingredient sheet', () => {
  const label = {
    caloriesPer100g: 63,
    proteinPer100g: 11,
    carbsPer100g: 4,
    fatPer100g: 0.2,
    fiberPer100g: 0,
  };

  it('CONFLICT names the catalog row; resolve finds it for "Use it"', async () => {
    const attempt = client.ingredients.createCustom.mutate({ name: 'egg', ...label });
    await expect(attempt).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    const message = await attempt.then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : ''),
    );
    const named = /already has "([^"]+)"/.exec(message)?.[1];
    expect(named).toBeTruthy();

    const [hit] = await client.ingredients.resolve.query({ lines: [{ rawName: named ?? 'egg' }] });
    expect(hit?.match?.owner).toBe('global');
  });

  it('"No, mine is different" creates a private row the form can link and compute', async () => {
    const name = `contract skyr ${Date.now()}`;
    const row = await client.ingredients.createCustom.mutate({
      name,
      ...label,
      category: 'DAIRY_YOGURT_CREAM',
      densityGPerMl: 1.05,
      gramsPerPiece: 140,
      confirmDifferent: true,
    });
    expect(row.id).toBeTruthy();
    expect(row.owner).toBe('mine');
    expect(row.hasDensity).toBe(true);
    expect(row.portions).toEqual([{ unit: 'piece', grams: 140 }]);

    const [detail] = await client.ingredients.getMany.query({ ids: [row.id ?? ''] });
    expect(detail?.per100g.calories).toBe(63);
  });
});
