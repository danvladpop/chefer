import { beforeAll, describe, expect, it } from 'vitest';
import { makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// mealPlan.replaceRecipe round-trip (the Plan tab's recipe-picker sheet, no
// AI involved): swap one slot to a different catalog recipe, verify, then
// swap it back so the seeded plan is left exactly as found. Skips cleanly
// when alice has no plan this week (local dev DB state varies; CI seeds one).

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
  if (!user.session) {
    throw new Error('mobile login response is missing the session credential');
  }
  setToken(user.session.token);
});

describe('mealPlan.replaceRecipe (picker sheet contract)', () => {
  it('replaces a slot with a chosen recipe and restores it', async () => {
    const plan = await client.mealPlan.getForWeek.query({ weekOffset: 0 }).catch(() => null);
    const day = plan?.days.find((d) => d.meals.length > 0);
    const meal = day?.meals[0];
    if (!plan || !day || !meal) {
      console.warn('[plan.contract] no meal plan this week — replaceRecipe not exercised');
      return;
    }

    const recipes = await client.recipe.list.query({ limit: 10 });
    const replacement = recipes.find((r) => r.id !== meal.recipe.id);
    if (!replacement) {
      console.warn('[plan.contract] catalog too small — replaceRecipe not exercised');
      return;
    }

    const original = meal.recipe.id;
    await client.mealPlan.replaceRecipe.mutate({
      planId: plan.planId,
      dayOfWeek: day.dayOfWeek,
      mealType: meal.type,
      recipeId: replacement.id,
    });

    const after = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
    const replaced = after?.days
      .find((d) => d.dayOfWeek === day.dayOfWeek)
      ?.meals.find((m) => m.type === meal.type);
    expect(replaced?.recipe.id).toBe(replacement.id);

    // Restore the slot so the suite stays idempotent.
    await client.mealPlan.replaceRecipe.mutate({
      planId: plan.planId,
      dayOfWeek: day.dayOfWeek,
      mealType: meal.type,
      recipeId: original,
    });
    const restored = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
    expect(
      restored?.days
        .find((d) => d.dayOfWeek === day.dayOfWeek)
        ?.meals.find((m) => m.type === meal.type)?.recipe.id,
    ).toBe(original);
  });
});

describe('mealPlan week templates (My Weeks contract)', () => {
  it('save → list → rename → delete leaves no trace', async () => {
    const plan = await client.mealPlan.getForWeek.query({ weekOffset: 0 }).catch(() => null);
    if (!plan) {
      console.warn('[plan.contract] no meal plan this week — template cycle not exercised');
      return;
    }

    const saved = await client.mealPlan.saveAsTemplate.mutate({
      planId: plan.planId,
      name: 'Contract test week',
    });
    expect(saved.name).toBe('Contract test week');
    expect(saved.mealsCount).toBeGreaterThan(0);

    try {
      const listed = await client.mealPlan.listTemplates.query();
      const mine = listed.find((t) => t.id === saved.id);
      expect(mine?.previewNames.length).toBeGreaterThan(0);
      expect(mine?.isFollowed).toBe(false);

      await client.mealPlan.renameTemplate.mutate({ templateId: saved.id, name: 'Renamed week' });
      const renamed = await client.mealPlan.listTemplates.query();
      expect(renamed.find((t) => t.id === saved.id)?.name).toBe('Renamed week');

      // Templates must not leak into plan history.
      const history = await client.mealPlan.list.query({ limit: 50 });
      expect(history.some((p) => p.id === saved.id)).toBe(false);
    } finally {
      await client.mealPlan.deleteTemplate.mutate({ templateId: saved.id });
    }
    const after = await client.mealPlan.listTemplates.query();
    expect(after.some((t) => t.id === saved.id)).toBe(false);
  });
});
