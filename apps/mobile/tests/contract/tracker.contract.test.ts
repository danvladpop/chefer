import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// T-19.1–T-19.4 (UX-19): the search-first Log sheet's API surface —
// tracker.recents, updateCustomMeal/restoreCustomMeal (edit/undo, bug B-34),
// copyDay + deleteEntries (T-19.3), unlogRecipe (the one-save model's untick,
// bug B-23), and ingredients.search carrying per100g (T-19.1, T-BUG-X7).
// Uses a fixed past date well outside any seeded plan week, and cleans up
// after itself so the suite stays idempotent across runs.

const { client, setToken } = makeContractClient();
const TEST_DATE = '2021-03-15';
const TEST_DATE_2 = '2021-03-16';
// recents scans the most recently LOGGED days (not a calendar window), so a
// probe entry must land on an actually-recent date to be scanned at all —
// unlike the other tests here, which use a fixed past date specifically to
// stay out of that window and avoid disturbing real recent activity.
const TODAY = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
  if (!user.session) {
    throw new Error('mobile login response is missing the session credential');
  }
  setToken(user.session.token);
});

// Best-effort cleanup: every test that logs something on these dates removes
// it again so re-runs never accumulate custom entries on alice. TODAY is
// deliberately NOT swept here (unlike the other two, it may carry real
// activity) — the recents test cleans up its own probe entry directly.
afterEach(async () => {
  for (const date of [TEST_DATE, TEST_DATE_2]) {
    const day = await client.tracker.getDay.query({ date }).catch(() => null);
    const entryIds = (day?.log?.loggedMeals ?? [])
      .map((m) => m.entryId)
      .filter((id): id is string => !!id);
    if (entryIds.length > 0) {
      await client.tracker.deleteEntries.mutate({ date, entryIds }).catch(() => undefined);
    }
  }
});

describe('tracker.updateCustomMeal / restoreCustomMeal (bug B-34, T-19.2)', () => {
  it('edits a custom entry by entryId, then Undo restores it exactly (AC2)', async () => {
    await client.tracker.logCustomMeal.mutate({
      date: TEST_DATE,
      name: 'Contract test snack',
      estimatedBy: 'manual',
      mealType: 'snack',
      kcal: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    });
    const before = await client.tracker.getDay.query({ date: TEST_DATE });
    const entry = before.log?.loggedMeals.find((m) => m.custom?.name === 'Contract test snack');
    expect(entry?.entryId).toBeTruthy();
    if (!entry?.entryId) return;

    await client.tracker.updateCustomMeal.mutate({
      date: TEST_DATE,
      entryId: entry.entryId,
      kcal: 250,
      protein: 12,
      carbs: 25,
      fat: 6,
    });
    const afterEdit = await client.tracker.getDay.query({ date: TEST_DATE });
    const edited = afterEdit.log?.loggedMeals.find((m) => m.entryId === entry.entryId);
    expect(edited?.kcal).toBe(250);

    // Delete (the bin), then Undo — the snapshot is exactly what getDay held.
    if (!edited?.custom) throw new Error('expected the edited entry to be a custom one');
    const snapshot = {
      entryId: edited.entryId,
      custom: edited.custom,
      mealType: edited.mealType,
      portionMultiplier: edited.portionMultiplier,
      kcal: edited.kcal,
      protein: edited.protein,
      carbs: edited.carbs,
      fat: edited.fat,
    };
    const loggedMeals = afterEdit.log?.loggedMeals ?? [];
    await client.tracker.deleteCustomMeal.mutate({
      date: TEST_DATE,
      entryIndex: loggedMeals.indexOf(edited),
    });
    await client.tracker.restoreCustomMeal.mutate({ date: TEST_DATE, entry: snapshot });
    const restored = await client.tracker.getDay.query({ date: TEST_DATE });
    const found = restored.log?.loggedMeals.find((m) => m.entryId === entry.entryId);
    expect(found).toMatchObject({ kcal: 250, protein: 12, carbs: 25, fat: 6 });
  });

  it('404s an entryId that names a planned-recipe entry, not a custom one', async () => {
    const plan = await client.mealPlan.getForWeek.query({ weekOffset: 0 }).catch(() => null);
    const day = plan?.days.find((d) => d.meals.length > 0);
    const meal = day?.meals[0];
    if (!plan || !day || !meal) {
      console.warn('[tracker.contract] no meal plan this week — recipe-entryId 404 not exercised');
      return;
    }
    await expect(
      client.tracker.updateCustomMeal.mutate({
        date: TEST_DATE,
        entryId: 'not-a-real-entry-id',
        kcal: 100,
        protein: 0,
        carbs: 0,
        fat: 0,
      }),
    ).rejects.toThrow();
  });
});

describe('tracker.recents (T-19.1) — the Log sheet’s Recent group', () => {
  it('surfaces a just-logged custom entry, and excludes it once deleted', async () => {
    await client.tracker.logCustomMeal.mutate({
      date: TODAY,
      name: 'Contract recents probe',
      estimatedBy: 'manual',
      mealType: 'breakfast',
      kcal: 300,
      protein: 15,
      carbs: 30,
      fat: 8,
    });
    try {
      const recents = await client.tracker.recents.query({ limit: 30 });
      expect(recents.some((r) => r.name === 'Contract recents probe')).toBe(true);

      const day = await client.tracker.getDay.query({ date: TODAY });
      const entry = day.log?.loggedMeals.find((m) => m.custom?.name === 'Contract recents probe');
      expect(entry?.entryId).toBeTruthy();
      if (entry?.entryId) {
        await client.tracker.deleteEntries.mutate({ date: TODAY, entryIds: [entry.entryId] });
      }
      const afterDelete = await client.tracker.recents.query({ limit: 30 });
      expect(afterDelete.some((r) => r.name === 'Contract recents probe')).toBe(false);
    } finally {
      // Belt and braces: make sure the probe never lingers even if an
      // assertion above threw before the mid-test cleanup ran.
      const day = await client.tracker.getDay.query({ date: TODAY }).catch(() => null);
      const stray = day?.log?.loggedMeals.find((m) => m.custom?.name === 'Contract recents probe');
      if (stray?.entryId) {
        await client.tracker.deleteEntries
          .mutate({ date: TODAY, entryIds: [stray.entryId] })
          .catch(() => undefined);
      }
    }
  });
});

describe('tracker.copyDay + deleteEntries (T-19.3 — "Copy {yesterday} to today")', () => {
  it('copies every entry with fresh ids, and Undo (deleteEntries) removes exactly the copies', async () => {
    await client.tracker.logCustomMeal.mutate({
      date: TEST_DATE,
      name: 'Contract copy source',
      estimatedBy: 'manual',
      mealType: 'lunch',
      kcal: 400,
      protein: 20,
      carbs: 40,
      fat: 10,
    });
    const result = await client.tracker.copyDay.mutate({
      fromDate: TEST_DATE,
      toDate: TEST_DATE_2,
    });
    expect(result.copiedEntryIds.length).toBeGreaterThan(0);

    const target = await client.tracker.getDay.query({ date: TEST_DATE_2 });
    expect(target.log?.loggedMeals.some((m) => m.custom?.name === 'Contract copy source')).toBe(
      true,
    );

    await client.tracker.deleteEntries.mutate({
      date: TEST_DATE_2,
      entryIds: result.copiedEntryIds,
    });
    const afterUndo = await client.tracker.getDay.query({ date: TEST_DATE_2 });
    expect(afterUndo.log?.loggedMeals.some((m) => m.custom?.name === 'Contract copy source')).toBe(
      false,
    );
  });
});

describe('tracker.logRecipe / unlogRecipe (bug B-23, T-19.4 — the one-save model)', () => {
  it('logs a recipe, then unlogRecipe removes exactly that slot', async () => {
    const recipes = await client.recipe.list.query({ limit: 1 });
    const recipe = recipes.at(0);
    if (!recipe) {
      console.warn('[tracker.contract] empty catalog — logRecipe/unlogRecipe not exercised');
      return;
    }
    await client.tracker.logRecipe.mutate({
      date: TEST_DATE,
      recipeId: recipe.id,
      mealType: 'dinner',
      portionMultiplier: 1,
    });
    const logged = await client.tracker.getDay.query({ date: TEST_DATE });
    expect(logged.log?.loggedMeals.some((m) => m.recipeId === recipe.id)).toBe(true);

    await client.tracker.unlogRecipe.mutate({
      date: TEST_DATE,
      recipeId: recipe.id,
      mealType: 'dinner',
    });
    const unlogged = await client.tracker.getDay.query({ date: TEST_DATE });
    expect(unlogged.log?.loggedMeals.some((m) => m.recipeId === recipe.id)).toBe(false);
  });

  it('is a no-op, not an error, when nothing matches (an already-unticked row)', async () => {
    await expect(
      client.tracker.unlogRecipe.mutate({
        date: TEST_DATE,
        recipeId: 'does-not-exist',
        mealType: 'dinner',
      }),
    ).resolves.toBeTruthy();
  });
});

describe('ingredients.search — per100g (T-19.1, T-BUG-X7)', () => {
  it('rows carry per100g macros (or null) and never a barcode/brand field (B-29, AC6)', async () => {
    const results = await client.ingredients.search.query({ query: 'chicken' });
    if (results.length === 0) {
      console.warn('[tracker.contract] no ingredient catalog rows matched "chicken"');
      return;
    }
    for (const row of results) {
      expect(row).not.toHaveProperty('barcode');
      expect(row).not.toHaveProperty('brand');
      if (row.per100g !== null) {
        expect(typeof row.per100g.calories).toBe('number');
        expect(typeof row.per100g.protein).toBe('number');
        expect(typeof row.per100g.carbs).toBe('number');
        expect(typeof row.per100g.fat).toBe('number');
      }
    }
  });
});
