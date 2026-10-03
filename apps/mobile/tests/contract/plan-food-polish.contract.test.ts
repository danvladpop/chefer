import { beforeAll, describe, expect, it } from 'vitest';
import { localDateStr } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// WP-10 lane C (UX-PLAN-04/05/11): the additive API the plan polish relies on.
// Mutates state, so it runs on a throwaway FREE account (curated generation is
// instant and needs no AI).

const { client, setToken } = makeContractClient();

type Plan = Awaited<ReturnType<typeof client.mealPlan.generate.mutate>>;
let plan: Plan;

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('plan-polish'),
    password: 'Contract@123!',
    firstName: 'Polish',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
  plan = await client.mealPlan.generate.mutate({ weekOffset: 0 });
}, 60_000);

const slotOf = async (planId: string, dayOfWeek: number, mealType: string) => {
  const week = await client.mealPlan.getById.query({ planId });
  return week.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals.find((m) => m.type === mealType);
};

describe('UX-PLAN-04: Undo of a swap does not leave the slot pinned', () => {
  it('replaceRecipe pins by default, `pinned: false` restores an unpinned slot, `previousPinned` reports the old state', async () => {
    const day = plan.days.find((d) => d.meals.length > 0);
    const meal = day?.meals[0];
    if (!day || !meal) throw new Error('generated plan has no meals');
    const base = { planId: plan.planId, dayOfWeek: day.dayOfWeek, mealType: meal.type };

    const options = await client.recipe.list.query({ limit: 20, slotType: meal.type });
    const other = options.find((r) => r.id !== meal.recipe.id);
    if (!other) throw new Error('catalog too small');

    // Default (old clients): the replaced slot becomes "Your pick".
    const first = await client.mealPlan.replaceRecipe.mutate({ ...base, recipeId: other.id });
    expect(first.previousRecipeId).toBe(meal.recipe.id);
    expect(first.previousPinned).toBeUndefined();
    expect((await slotOf(plan.planId, day.dayOfWeek, meal.type))?.pinned).toBe(true);

    // Undo: back to the original, NOT pinned (it was not pinned before).
    const undo = await client.mealPlan.replaceRecipe.mutate({
      ...base,
      recipeId: meal.recipe.id,
      pinned: false,
    });
    expect(undo.previousPinned).toBe(true);
    const restored = await slotOf(plan.planId, day.dayOfWeek, meal.type);
    expect(restored?.recipe.id).toBe(meal.recipe.id);
    expect(restored?.pinned).toBeUndefined();
  });
});

describe('UX-PLAN-05: recipe.list ranks for the slot', () => {
  it('lists curated recipes of the slot first and tags them with mealType', async () => {
    const rows = await client.recipe.list.query({ limit: 30, slotType: 'breakfast' });
    const typed = rows.filter((r) => r.mealType !== undefined);
    // Whatever is known to be a breakfast comes before anything known to be another meal.
    const firstOther = rows.findIndex(
      (r) => r.mealType !== undefined && r.mealType !== 'breakfast',
    );
    const lastBreakfast = rows.map((r) => r.mealType).lastIndexOf('breakfast');
    if (firstOther !== -1 && lastBreakfast !== -1) expect(lastBreakfast).toBeLessThan(firstOther);
    for (const row of typed)
      expect(['breakfast', 'lunch', 'dinner', 'snack']).toContain(row.mealType);
  });

  it('is unchanged without slotType (older clients)', async () => {
    const rows = await client.recipe.list.query({ limit: 10 });
    expect(rows.every((r) => r.mealType === undefined)).toBe(true);
  });
});

describe('UX-PLAN-11: Use this week again', () => {
  it('restore({ weekOffset: 1 }) copies a plan into next week; getById reports loggedRecipeIds only when something was logged', async () => {
    const again = await client.mealPlan.restore.mutate({ planId: plan.planId, weekOffset: 1 });
    expect(again.planId).not.toBe(plan.planId);
    const next = await client.mealPlan.getForWeek.query({ weekOffset: 1 });
    expect(next?.planId).toBe(again.planId);
    // Same meals as the plan it came from.
    const ids = (p: Plan) => p.days.flatMap((d) => d.meals.map((m) => m.recipe.id)).join();
    expect(ids(again)).toBe(ids(plan));

    const detail = await client.mealPlan.getById.query({ planId: plan.planId });
    expect(detail.days.every((d) => d.loggedRecipeIds === undefined)).toBe(true);

    // Log a planned meal today, then the past-week view marks it.
    const now = new Date();
    const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const day = plan.days.find((d) => d.dayOfWeek === todayIndex && d.meals.length > 0);
    const meal = day?.meals[0];
    if (!day || !meal) throw new Error("today's plan day has no meals");
    await client.tracker.logRecipe.mutate({
      date: localDateStr(now),
      recipeId: meal.recipe.id,
      mealType: meal.type,
      portionMultiplier: 1,
    });
    const logged = await client.mealPlan.getById.query({ planId: plan.planId });
    expect(logged.days.find((d) => d.dayOfWeek === day.dayOfWeek)?.loggedRecipeIds).toContain(
      meal.recipe.id,
    );
  });
});
