import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-REC-04 / UX-REC-08 against the REAL API: `recipe.deleteMine` is a SOFT
// delete (additive `deletedAt`) — the recipe disappears from every list and
// from the owner's edit path, an old client that still holds its id (a plan
// slot, a deep link) gets a tombstone or a NOT_FOUND, never a 500 — and
// `restoreMine` is the Undo. `recipe.addToWeek` adds any visible recipe to the
// week without Following. ONE throwaway user (auth rate limit: don't register
// more here). Free generation is curated and instant (no AI).

const { client, setToken } = makeContractClient();

const dayIndex = (d: Date): number => (d.getDay() === 0 ? 6 : d.getDay() - 1);
const UNRESOLVABLE = 'contract-only mystery flour';

async function createRecipe(name: string) {
  return client.recipe.create.mutate({
    name,
    ingredients: [{ name: UNRESOLVABLE, quantity: 200, unit: 'g' }],
    instructions: ['Mix.'],
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { data?: { code?: string } }).data?.code;
  }
}

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('recipe-delete'),
    password: 'Contract@123!',
    firstName: 'Deleter',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
  await client.mealPlan.generate.mutate({ weekOffset: 0 });
}, 60_000);

describe('recipe.deleteMine / restoreMine', () => {
  it('hides the recipe from every list and from edit, and Undo brings it back', async () => {
    const created = await createRecipe(`Delete me ${Date.now()}`);
    const inLists = async () => ({
      mine: (await client.recipe.list.query({ myRecipesOnly: true })).some(
        (r) => r.id === created.id,
      ),
      all: (await client.recipe.list.query({})).some((r) => r.id === created.id),
    });
    expect(await inLists()).toEqual({ mine: true, all: true });

    await expect(client.recipe.deleteMine.mutate({ recipeId: created.id })).resolves.toEqual({
      recipeId: created.id,
    });
    expect(await inLists()).toEqual({ mine: false, all: false });
    expect(await codeOf(client.recipe.getMyRecipe.query({ recipeId: created.id }))).toBe(
      'NOT_FOUND',
    );
    // Not in a plan: the page's own query answers NOT_FOUND too, not a 500.
    expect(await codeOf(client.mealPlan.getRecipe.query({ recipeId: created.id }))).toBe(
      'NOT_FOUND',
    );
    expect(await codeOf(client.recipe.toggleFavourite.mutate({ recipeId: created.id }))).toBe(
      'NOT_FOUND',
    );
    expect(await codeOf(client.recipe.deleteMine.mutate({ recipeId: created.id }))).toBe(
      'NOT_FOUND',
    );

    await client.recipe.restoreMine.mutate({ recipeId: created.id });
    expect(await inLists()).toEqual({ mine: true, all: true });
    const back = await client.mealPlan.getRecipe.query({ recipeId: created.id });
    expect(back.name).toBe(created.name);
    expect(back.deleted).toBeUndefined();
  });

  it('an id that is not yours or does not exist answers NOT_FOUND, never an error', async () => {
    expect(await codeOf(client.recipe.deleteMine.mutate({ recipeId: 'does-not-exist' }))).toBe(
      'NOT_FOUND',
    );
    expect(await codeOf(client.recipe.restoreMine.mutate({ recipeId: 'does-not-exist' }))).toBe(
      'NOT_FOUND',
    );
  });

  it('a plan slot that still holds the deleted recipe resolves it as a tombstone', async () => {
    const created = await createRecipe(`Planned then deleted ${Date.now()}`);
    const added = await client.recipe.addToWeek.mutate({
      recipeId: created.id,
      weekOffset: 0,
      dayOfWeek: dayIndex(new Date()),
      mealType: 'snack',
      mode: 'add',
    });
    expect(added.addedRecipeId).toBe(created.id);

    await client.recipe.deleteMine.mutate({ recipeId: created.id });
    const week = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
    const slot = week?.days.flatMap((d) => d.meals).find((m) => m.recipe.id === created.id);
    expect(slot?.recipe.name).toBe(created.name);
    const tombstone = await client.mealPlan.getRecipe.query({ recipeId: created.id });
    expect(tombstone.deleted).toBe(true);
    // It is out of the lists and cannot be edited, even while the slot keeps it.
    expect((await client.recipe.list.query({})).some((r) => r.id === created.id)).toBe(false);
    expect(await codeOf(client.recipe.getMyRecipe.query({ recipeId: created.id }))).toBe(
      'NOT_FOUND',
    );
  });
});

describe('recipe.addToWeek / undoAddToWeek (no Following)', () => {
  it('adds an own recipe to the week and undoes it', async () => {
    const created = await createRecipe(`Add and undo ${Date.now()}`);
    const added = await client.recipe.addToWeek.mutate({
      recipeId: created.id,
      weekOffset: 0,
      dayOfWeek: dayIndex(new Date()),
      mealType: 'breakfast',
      mode: 'add',
    });
    const holds = async () =>
      (await client.mealPlan.getForWeek.query({ weekOffset: 0 }))?.days
        .flatMap((d) => d.meals)
        .some((m) => m.recipe.id === created.id);
    expect(await holds()).toBe(true);

    await client.recipe.undoAddToWeek.mutate({
      planId: added.planId,
      dayOfWeek: added.dayOfWeek,
      mealType: added.mealType,
      slotIndex: added.slotIndex,
      addedRecipeId: added.addedRecipeId,
    });
    expect(await holds()).toBe(false);
  });

  it('refuses a recipe the caller cannot see with NOT_FOUND', async () => {
    expect(
      await codeOf(
        client.recipe.addToWeek.mutate({
          recipeId: 'does-not-exist',
          weekOffset: 0,
          dayOfWeek: 0,
          mealType: 'dinner',
          mode: 'add',
        }),
      ),
    ).toBe('NOT_FOUND');
  });
});

describe('recipe.list paging (UX-REC-05)', () => {
  it('pages the Saved and Mine tabs with the last recipe id as the cursor', async () => {
    const made = [];
    for (const n of [1, 2, 3]) {
      const r = await createRecipe(`Paged ${n} ${Date.now()}`);
      await client.recipe.toggleFavourite.mutate({ recipeId: r.id });
      made.push(r.id);
    }
    for (const tab of [{ savedOnly: true }, { myRecipesOnly: true }]) {
      const first = await client.recipe.list.query({ ...tab, limit: 2 });
      expect(first).toHaveLength(2);
      const last = first[1];
      if (!last) throw new Error('expected a second row');
      const second = await client.recipe.list.query({ ...tab, limit: 2, cursor: last.id });
      expect(second.length).toBeGreaterThan(0);
      // No row repeats across the two pages.
      const ids = new Set(first.map((r) => r.id));
      expect(second.some((r) => ids.has(r.id))).toBe(false);
    }
  });
});
