import { beforeAll, describe, expect, it } from 'vitest';
import { localDateStr } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-FOOD-02 / UX-PLAN-09: "the plan for date X" is the plan whose WEEK
// matches. Opening next week creates a second ACTIVE plan that is newer than
// this week's; the tracker (and the post-log rebalance, coach, pantry and
// shop) used to read "the newest ACTIVE plan of any week" and so showed next
// week's meals as today's. Mutates state, so it runs on a throwaway FREE
// account. Free generation is curated and instant (no AI), 3 per day.

const { client, setToken } = makeContractClient();

const addDays = (d: Date, n: number): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};
/** 0 = Monday … 6 = Sunday, like MealPlanDay.dayOfWeek. */
const dayIndex = (d: Date): number => (d.getDay() === 0 ? 6 : d.getDay() - 1);

type Plan = Awaited<ReturnType<typeof client.mealPlan.generate.mutate>>;
const mealIds = (plan: Plan, dayOfWeek: number): string[] =>
  (plan.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals ?? []).map((m) => m.recipe.id);

let thisWeek: Plan;
let nextWeek: Plan;

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('plan-week'),
    password: 'Contract@123!',
    firstName: 'Weeks',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);

  thisWeek = await client.mealPlan.generate.mutate({ weekOffset: 0 });
  nextWeek = await client.mealPlan.generate.mutate({ weekOffset: 1 });
  // The two weeks must differ on the weekday we probe, or the test proves
  // nothing; the curated pick is random, so try once more if they collide.
  const probe = dayIndex(new Date());
  if (mealIds(thisWeek, probe).join() === mealIds(nextWeek, probe).join()) {
    nextWeek = await client.mealPlan.generate.mutate({ weekOffset: 1 });
  }
}, 60_000);

describe('two ACTIVE plans in adjacent weeks', () => {
  it("tracker.getDay lists THIS week's meals for today and next week's for +7 days", async () => {
    const today = new Date();
    const probe = dayIndex(today);
    expect(mealIds(thisWeek, probe)).not.toEqual(mealIds(nextWeek, probe)); // a real test

    const todayDay = await client.tracker.getDay.query({ date: localDateStr(today) });
    expect(todayDay.plannedMeals.map((m) => m.recipeId)).toEqual(mealIds(thisWeek, probe));

    const nextDay = await client.tracker.getDay.query({ date: localDateStr(addDays(today, 7)) });
    expect(nextDay.plannedMeals.map((m) => m.recipeId)).toEqual(mealIds(nextWeek, probe));
  });

  it('agrees with what the Plan tab shows for the current week', async () => {
    const today = new Date();
    const plan = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
    const day = await client.tracker.getDay.query({ date: localDateStr(today) });
    expect(day.plannedMeals.map((m) => m.recipeId)).toEqual(
      (plan?.days.find((d) => d.dayOfWeek === dayIndex(today))?.meals ?? []).map(
        (m) => m.recipe.id,
      ),
    );
  });

  it("a logged planned meal is not 'off-plan' (it would be, against next week's plan)", async () => {
    const today = new Date();
    const date = localDateStr(today);
    const planned = (await client.tracker.getDay.query({ date })).plannedMeals[0];
    if (!planned) throw new Error('expected a planned meal today');

    await client.tracker.logRecipe.mutate({
      date,
      recipeId: planned.recipeId,
      mealType: planned.mealType,
      portionMultiplier: 1,
      ...(planned.slotIndex !== undefined && { slotIndex: planned.slotIndex }),
    });
    const after = await client.tracker.getDay.query({ date });
    expect(after.log?.loggedMeals.some((m) => m.recipeId === planned.recipeId)).toBe(true);
    expect(after.offPlanLogged).toEqual([]);
  });
});

describe('tracker.deleteCustomMeal — entryId vs index (UX-FOOD-17)', () => {
  const date = localDateStr(new Date());
  const add = (name: string) =>
    client.tracker.logCustomMeal.mutate({
      date,
      name,
      estimatedBy: 'manual',
      mealType: 'snack',
      kcal: 100,
      protein: 1,
      carbs: 1,
      fat: 1,
    });

  it('deletes by entryId even when the client-side index is stale; the old index path still works', async () => {
    await add('Contract A');
    await add('Contract B');
    await add('Contract C');
    const day = await client.tracker.getDay.query({ date });
    const find = (name: string) => day.log?.loggedMeals.find((m) => m.custom?.name === name);
    const b = find('Contract B');
    expect(b?.entryId).toBeTruthy();

    // A stale/wrong index plus the right id: the id wins and B is the one that goes.
    await client.tracker.deleteCustomMeal.mutate({
      date,
      entryId: b!.entryId!,
      entryIndex: 0,
    });
    const afterId = await client.tracker.getDay.query({ date });
    const names = afterId.log?.loggedMeals.flatMap((m) => (m.custom ? [m.custom.name] : []));
    expect(names).toContain('Contract A');
    expect(names).toContain('Contract C');
    expect(names).not.toContain('Contract B');

    // 1.0.1 clients: index only.
    const index = afterId.log!.loggedMeals.findIndex((m) => m.custom?.name === 'Contract A');
    await client.tracker.deleteCustomMeal.mutate({ date, entryIndex: index });
    const afterIndex = await client.tracker.getDay.query({ date });
    const left = afterIndex.log?.loggedMeals.flatMap((m) => (m.custom ? [m.custom.name] : []));
    expect(left).toEqual(['Contract C']);

    // Neither field is a validation error.
    await expect(client.tracker.deleteCustomMeal.mutate({ date })).rejects.toThrow();
  });
});

describe('off-plan logged recipes are editable and removable (UX-FOOD-03)', () => {
  it('edits the portion by entryId, then deletes the entry', async () => {
    const date = localDateStr(addDays(new Date(), -1)); // yesterday, still this/last week
    // A recipe that is NOT on the plan for that day: take one from next week's plan.
    const offPlan = nextWeek.days.flatMap((d) => d.meals)[0]!.recipe;
    await client.tracker.logRecipe.mutate({
      date,
      recipeId: offPlan.id,
      mealType: 'dinner',
      portionMultiplier: 1,
    });
    const day = await client.tracker.getDay.query({ date });
    const row = day.offPlanLogged.find((m) => m.recipeId === offPlan.id);
    expect(row?.entryId).toBeTruthy();

    await client.tracker.updateRecipeEntry.mutate({
      date,
      entryId: row!.entryId!,
      portionMultiplier: 2,
    });
    const edited = (await client.tracker.getDay.query({ date })).offPlanLogged.find(
      (m) => m.recipeId === offPlan.id,
    );
    expect(edited?.portionMultiplier).toBe(2);
    expect(edited?.kcal).toBe(Math.round((row?.kcal ?? 0) * 2));

    await client.tracker.deleteEntries.mutate({ date, entryIds: [row!.entryId!] });
    const gone = await client.tracker.getDay.query({ date });
    expect(gone.offPlanLogged.find((m) => m.recipeId === offPlan.id)).toBeUndefined();
  });
});
