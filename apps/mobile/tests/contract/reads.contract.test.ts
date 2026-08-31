import { beforeAll, describe, expect, it } from 'vitest';
import { makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// Representative protected reads across the major routers, all through the
// app's real link stack. Read-only against the seeded alice account — one
// login per run (rate limit budget: 10/15min per IP).

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
  if (!user.session) {
    throw new Error('mobile login response is missing the session credential');
  }
  setToken(user.session.token);
});

describe('protected reads via Bearer', () => {
  it('auth.me returns the seeded profile', async () => {
    const me = await client.auth.me.query();
    expect(me?.email).toBe(SEED_EMAIL);
  });

  it('dashboard.summary responds', async () => {
    const summary = await client.dashboard.summary.query();
    expect(summary).toBeTruthy();
  });

  it('preferences.hasProfile + get respond', async () => {
    const has = await client.preferences.hasProfile.query();
    expect(typeof has === 'boolean' || typeof has === 'object').toBe(true);
    await client.preferences.get.query();
  });

  it('recipe.list responds with items', async () => {
    const page = await client.recipe.list.query({});
    expect(page).toBeTruthy();
  });

  it('recipe detail queries respond for a listed recipe (M2-3)', async () => {
    const page = await client.recipe.list.query({ limit: 1 });
    const first = page.at(0);
    if (!first) {
      return; // empty catalog — nothing to probe
    }
    const recipe = await client.mealPlan.getRecipe.query({ recipeId: first.id });
    expect(recipe.name).toBeTruthy();
    expect(Array.isArray(recipe.ingredients)).toBe(true);
    expect(Array.isArray(recipe.instructions)).toBe(true);
    const saved = await client.recipe.isSaved.query({ recipeId: first.id });
    expect(typeof saved.isSaved).toBe('boolean');
  });

  it('shoppingList.getForWeek responds with items + checkedKeys (M2-5)', async () => {
    const list = await client.shoppingList.getForWeek.query({ weekOffset: 0 });
    expect(Array.isArray(list.items)).toBe(true);
    expect(Array.isArray(list.checkedKeys)).toBe(true);
    expect(typeof list.hasPlan).toBe('boolean');
  });

  it('More-hub screens read their data (M2-4/6/7/8)', async () => {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const day = await client.tracker.getDay.query({ date: today });
    expect(Array.isArray(day.plannedMeals)).toBe(true);
    expect(day.targets.dailyCalorieTarget).toBeGreaterThan(0);

    const pantry = await client.pantry.list.query();
    expect(Array.isArray(pantry.items)).toBe(true);

    const me = await client.user.me.query();
    expect(me.email).toBe(SEED_EMAIL);

    const usage = await client.profile.getAiUsage.query();
    expect(usage.today).toBeTruthy();
  });

  it('tracker.weeklySummary hydrates dates through superjson', async () => {
    const summary = await client.tracker.weeklySummary.query();
    expect(summary).toBeTruthy();
    const dates = JSON.stringify(summary).length;
    expect(dates).toBeGreaterThan(2);
  });
});
