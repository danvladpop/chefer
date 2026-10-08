import { beforeAll, describe, expect, it } from 'vitest';
import { localDateStr } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// FB7-04 (WP-24): a side dish is a second slot of the same meal type
// (`recipe.addToWeek` mode 'add'), and `mealPlan.removeSlot` takes one back
// out — only while another slot of that type remains, with the day's tracker
// state re-indexed. Runs on a throwaway FREE account (curated generation is
// instant and needs no AI).

const { client, setToken } = makeContractClient();
const other = makeContractClient();

const date = localDateStr(new Date());
const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

let planId = '';

const todayMeals = async () => {
  const plan = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
  if (!plan) throw new Error('no plan');
  const day = plan.days.find((d) => d.dayOfWeek === todayIndex);
  return { plan, meals: day?.meals ?? [] };
};

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('side-dish'),
    password: 'Contract@123!',
    firstName: 'Side',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
  const plan = await client.mealPlan.generate.mutate({ weekOffset: 0 });
  planId = plan.planId;

  const stranger = await other.client.auth.register.mutate({
    email: uniqueEmail('side-dish-other'),
    password: 'Contract@123!',
    firstName: 'Other',
    ...CONTRACT_CONSENT,
  });
  if (!stranger.session) throw new Error('register response is missing the session credential');
  other.setToken(stranger.session.token);
}, 90_000);

describe('mealPlan.removeSlot', () => {
  it('refuses the only meal of its type, and another user’s plan', async () => {
    const { meals } = await todayMeals();
    const first = meals[0];
    if (!first) throw new Error('no meals planned today');
    const index = meals.findIndex((m) => m.type === first.type);
    const alone = meals.filter((m) => m.type === first.type).length === 1;
    if (alone) {
      await expect(
        client.mealPlan.removeSlot.mutate({
          planId,
          dayOfWeek: todayIndex,
          mealType: first.type,
          slotIndex: index,
        }),
      ).rejects.toThrow(/only/i);
    }
    await expect(
      other.client.mealPlan.removeSlot.mutate({
        planId,
        dayOfWeek: todayIndex,
        mealType: first.type,
        slotIndex: index,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('adds sides, keeps the tracker on the right slot when an earlier one is removed', async () => {
    const { meals } = await todayMeals();
    const types = [...new Set(meals.map((m) => m.type))];
    const [typeA, typeB] = types;
    if (!typeA || !typeB) throw new Error('need two meal types planned today');
    const recipeOf = (type: string) => meals.find((m) => m.type === type)?.recipe.id ?? '';

    // Two sides: A's first (index n), then B's (index n + 1).
    const sideA = await client.recipe.addToWeek.mutate({
      recipeId: recipeOf(typeA),
      weekOffset: 0,
      dayOfWeek: todayIndex,
      mealType: typeA,
      mode: 'add',
    });
    const sideB = await client.recipe.addToWeek.mutate({
      recipeId: recipeOf(typeB),
      weekOffset: 0,
      dayOfWeek: todayIndex,
      mealType: typeB,
      mode: 'add',
    });
    expect(sideB.slotIndex).toBe(sideA.slotIndex + 1);

    // The day now holds both dishes of each type, and they count in the day.
    const withSides = await todayMeals();
    expect(withSides.meals.filter((m) => m.type === typeA)).toHaveLength(
      meals.filter((m) => m.type === typeA).length + 1,
    );
    const planned = await client.tracker.getDay.query({ date });
    expect(planned.plannedMeals.some((m) => m.slotIndex === sideB.slotIndex)).toBe(true);

    // Log B's side as eaten (slot-keyed), then remove A's side: B's slot shifts down.
    await client.tracker.logRecipe.mutate({
      date,
      recipeId: sideB.addedRecipeId,
      mealType: typeB,
      portionMultiplier: 1,
      slotIndex: sideB.slotIndex,
    });
    await expect(
      client.mealPlan.removeSlot.mutate({
        planId,
        dayOfWeek: todayIndex,
        mealType: typeA,
        slotIndex: sideA.slotIndex,
      }),
    ).resolves.toEqual({ ok: true });

    const after = await client.tracker.getDay.query({ date });
    const logged = after.log?.loggedMeals.find((m) => m.recipeId === sideB.addedRecipeId);
    expect(logged?.slotIndex).toBe(sideB.slotIndex - 1);
    const still = after.plannedMeals.find((m) => m.slotIndex === sideB.slotIndex - 1);
    expect(still).toMatchObject({ mealType: typeB, recipeId: sideB.addedRecipeId });
    expect((await todayMeals()).meals).toHaveLength(withSides.meals.length - 1);

    // A stale index is a plain-words refusal, not a silent no-op.
    await expect(
      client.mealPlan.removeSlot.mutate({
        planId,
        dayOfWeek: todayIndex,
        mealType: typeA,
        slotIndex: 19,
      }),
    ).rejects.toThrow(/no longer in this slot/i);

    // Clean up B's side.
    await client.tracker.unlogRecipe.mutate({
      date,
      recipeId: sideB.addedRecipeId,
      mealType: typeB,
      slotIndex: sideB.slotIndex - 1,
    });
    await client.mealPlan.removeSlot.mutate({
      planId,
      dayOfWeek: todayIndex,
      mealType: typeB,
      slotIndex: sideB.slotIndex - 1,
    });
  });
});
