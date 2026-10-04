import { beforeAll, describe, expect, it } from 'vitest';
import { localDateStr } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// WP-06 lane A: "Ate something else" (logCustomMeal + replacesSlot) and
// "Skipped it" (skipSlot / unskipSlot), against the REAL API through the app's
// own tRPC link. Mutates state, so it runs on a throwaway FREE account
// (curated generation is instant and needs no AI).

const { client, setToken } = makeContractClient();

const date = localDateStr(new Date());
// Same rule the clients use for "today's plan day" (Monday = 0).
const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

type Day = Awaited<ReturnType<typeof client.tracker.getDay.query>>;

const dayState = async (): Promise<Day> => client.tracker.getDay.query({ date });
const kcalOf = (day: Day) => day.log?.totalKcal ?? 0;
const slotOf = (day: Day, mealType: string) => {
  const meal = day.plannedMeals.find((m) => m.mealType === mealType);
  if (meal?.slotIndex === undefined) throw new Error(`no planned ${mealType} slot today`);
  return { mealType, slotIndex: meal.slotIndex, meal };
};

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('flex-eating'),
    password: 'Contract@123!',
    firstName: 'Flex',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
  await client.mealPlan.generate.mutate({ weekOffset: 0 });
}, 60_000);

describe('Ate something else (replacesSlot)', () => {
  it('replaces dinner: the day total uses the replacement, the slot cannot be ticked again, Undo restores it', async () => {
    const before = await dayState();
    expect(kcalOf(before)).toBe(0);
    const dinner = slotOf(before, 'dinner');

    const out = await client.tracker.logCustomMeal.mutate({
      date,
      name: 'Shawarma · normal',
      estimatedBy: 'manual',
      mealType: 'dinner',
      kcal: 775,
      protein: 40,
      carbs: 0,
      fat: 0,
      unknownMacros: ['carbs', 'fat'],
      replacesSlot: { mealType: 'dinner', slotIndex: dinner.slotIndex },
    });
    expect(out.entryId).toBeTruthy();

    // The day total is the replacement's, and the entry names its slot.
    const after = await dayState();
    expect(kcalOf(after)).toBe(775);
    const entry = after.log?.loggedMeals.find((m) => m.entryId === out.entryId);
    expect(entry?.replacesSlot).toEqual({ mealType: 'dinner', slotIndex: dinner.slotIndex });
    expect(entry?.custom?.name).toBe('Shawarma · normal');
    // It is a custom entry, never an off-plan recipe row.
    expect(after.offPlanLogged).toEqual([]);

    // Today: the slot is replaced (eaten with the replacement's numbers) and
    // its recipe left the planned total.
    const today = await client.dashboard.summary.query({ localDate: date, localHour: 12 });
    const slot = today.today.slots?.find((s) => s.slotIndex === dinner.slotIndex);
    expect(slot).toMatchObject({
      status: 'replaced',
      replacedBy: { entryId: out.entryId, name: 'Shawarma · normal', kcal: 775 },
    });
    expect(today.nutrition.eatenKcal).toBe(775);
    expect(today.restOfToday.map((m) => m.mealType)).not.toContain('dinner');

    // A second tick of the same slot is refused, in plain words.
    await expect(
      client.tracker.logRecipe.mutate({
        date,
        recipeId: dinner.meal.recipeId,
        mealType: 'dinner',
        portionMultiplier: 1,
        slotIndex: dinner.slotIndex,
      }),
    ).rejects.toThrow(/already logged something else/i);
    expect(kcalOf(await dayState())).toBe(775);

    // Undo = delete the replacement (existing path): the slot is open again.
    await client.tracker.deleteEntries.mutate({ date, entryIds: [out.entryId] });
    const undone = await dayState();
    expect(kcalOf(undone)).toBe(0);
    const reopened = await client.dashboard.summary.query({ localDate: date, localHour: 12 });
    expect(reopened.today.slots?.find((s) => s.slotIndex === dinner.slotIndex)?.status).toBe(
      'planned',
    );
    await expect(
      client.tracker.logRecipe.mutate({
        date,
        recipeId: dinner.meal.recipeId,
        mealType: 'dinner',
        portionMultiplier: 1,
        slotIndex: dinner.slotIndex,
      }),
    ).resolves.toBeDefined();
    await client.tracker.unlogRecipe.mutate({
      date,
      recipeId: dinner.meal.recipeId,
      mealType: 'dinner',
      slotIndex: dinner.slotIndex,
    });
  });

  it('is optional: a logCustomMeal without replacesSlot is the old entry shape', async () => {
    const out = await client.tracker.logCustomMeal.mutate({
      date,
      name: 'Croissant',
      estimatedBy: 'manual',
      mealType: 'snack',
      kcal: 300,
    });
    const day = await dayState();
    const entry = day.log?.loggedMeals.find((m) => m.entryId === out.entryId);
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty('replacesSlot');
    await client.tracker.deleteEntries.mutate({ date, entryIds: [out.entryId] });
  });
});

describe('Skipped it (skipSlot / unskipSlot)', () => {
  it('skipped lunch is neither remaining nor eaten; unskip restores it', async () => {
    const start = await dayState();
    const lunch = slotOf(start, 'lunch');
    const ref = { mealType: 'lunch', slotIndex: lunch.slotIndex };
    expect(start.skippedSlots).toEqual([]);

    const skipped = await client.tracker.skipSlot.mutate({ date, ...ref });
    expect(skipped.skippedSlots).toEqual([ref]);
    // Idempotent.
    expect((await client.tracker.skipSlot.mutate({ date, ...ref })).skippedSlots).toEqual([ref]);

    const day = await dayState();
    expect(day.skippedSlots).toEqual([ref]);
    expect(day.log?.skippedSlots).toEqual([ref]);
    // Not eaten: no entries, no calories.
    expect(day.log?.loggedMeals).toEqual([]);
    expect(kcalOf(day)).toBe(0);

    // Not remaining: Today drops it from next / rest of day and from the plan total.
    const plannedBefore = (await client.dashboard.summary.query({ localDate: date, localHour: 6 }))
      .nutrition.plannedKcal;
    const summary = await client.dashboard.summary.query({ localDate: date, localHour: 6 });
    const lunchSlot = summary.today.slots?.find((s) => s.slotIndex === lunch.slotIndex);
    expect(lunchSlot?.status).toBe('skipped');
    expect(summary.nextMeal?.slotIndex).not.toBe(lunch.slotIndex);
    expect(summary.restOfToday.map((m) => m.mealType)).not.toContain('lunch');
    expect(summary.nutrition.eatenKcal).toBe(0);

    // Unskip.
    const back = await client.tracker.unskipSlot.mutate({ date, ...ref });
    expect(back.skippedSlots).toEqual([]);
    expect((await dayState()).skippedSlots).toEqual([]);
    const restored = await client.dashboard.summary.query({ localDate: date, localHour: 6 });
    expect(restored.today.slots?.find((s) => s.slotIndex === lunch.slotIndex)?.status).toBe(
      'planned',
    );
    expect(restored.nutrition.plannedKcal).toBeGreaterThan(plannedBefore);
    // A retried Undo is harmless.
    await expect(client.tracker.unskipSlot.mutate({ date, ...ref })).resolves.toBeDefined();
  });

  it('refuses to skip a slot that is already ticked', async () => {
    const day = await dayState();
    const lunch = slotOf(day, 'lunch');
    await client.tracker.logRecipe.mutate({
      date,
      recipeId: lunch.meal.recipeId,
      mealType: 'lunch',
      portionMultiplier: 1,
      slotIndex: lunch.slotIndex,
    });
    await expect(
      client.tracker.skipSlot.mutate({ date, mealType: 'lunch', slotIndex: lunch.slotIndex }),
    ).rejects.toThrow(/already logged/i);
    await client.tracker.unlogRecipe.mutate({
      date,
      recipeId: lunch.meal.recipeId,
      mealType: 'lunch',
      slotIndex: lunch.slotIndex,
    });
  });

  it('eating a skipped slot un-skips it', async () => {
    const day = await dayState();
    const lunch = slotOf(day, 'lunch');
    const ref = { mealType: 'lunch', slotIndex: lunch.slotIndex };
    await client.tracker.skipSlot.mutate({ date, ...ref });
    await client.tracker.logRecipe.mutate({
      date,
      recipeId: lunch.meal.recipeId,
      mealType: 'lunch',
      portionMultiplier: 1,
      slotIndex: lunch.slotIndex,
    });
    expect((await dayState()).skippedSlots).toEqual([]);
    await client.tracker.unlogRecipe.mutate({
      date,
      recipeId: lunch.meal.recipeId,
      mealType: 'lunch',
      slotIndex: lunch.slotIndex,
    });
  });
});

// Ladder 2c: a 1.0.1 client reads this day. It sums `loggedMeals`, lists
// `offPlanLogged` rows and trusts `log.total*` — none of which may change.
describe('old clients: the legacy payload is unchanged', () => {
  it('a day with a replacement and a skip keeps every old field, and the entries still add up', async () => {
    const start = await dayState();
    const dinner = slotOf(start, 'dinner');
    const lunch = slotOf(start, 'lunch');
    await client.tracker.logCustomMeal.mutate({
      date,
      name: 'Pizza · big',
      estimatedBy: 'manual',
      mealType: 'dinner',
      kcal: 1130,
      protein: 40,
      replacesSlot: { mealType: 'dinner', slotIndex: dinner.slotIndex },
    });
    await client.tracker.skipSlot.mutate({
      date,
      mealType: 'lunch',
      slotIndex: lunch.slotIndex,
    });

    const day = await dayState();
    // Old top-level fields, same names and kinds.
    for (const key of [
      'date',
      'plannedMeals',
      'hasActivePlan',
      'offPlanLogged',
      'log',
      'targets',
    ] as const) {
      expect(day).toHaveProperty(key);
    }
    expect(day.date).toBe(date);
    expect(Array.isArray(day.plannedMeals)).toBe(true);
    expect(day.plannedMeals.length).toBeGreaterThan(0); // the slots are all still listed
    expect(day.offPlanLogged).toEqual([]);
    expect(Object.keys(day.targets).sort()).toEqual(
      ['carbsG', 'dailyCalorieTarget', 'fatG', 'proteinG'].sort(),
    );
    // Old log fields, with the day total equal to the sum of its entries — the
    // only maths an old client does. The skip is NOT an entry.
    const log = day.log;
    if (!log) throw new Error('expected a log');
    expect(log.loggedMeals).toHaveLength(1);
    const entry = log.loggedMeals[0];
    expect(entry).toMatchObject({
      mealType: 'dinner',
      portionMultiplier: 1,
      kcal: 1130,
      protein: 40,
      carbs: 0,
      fat: 0,
      custom: { name: 'Pizza · big', estimatedBy: 'manual' },
    });
    expect(entry?.recipeId).toBeUndefined();
    expect(log.loggedMeals.reduce((s, m) => s + m.kcal, 0)).toBe(log.totalKcal);
    expect(log.totalKcal).toBe(1130);
    for (const key of ['totalKcal', 'totalProtein', 'totalCarbs', 'totalFat'] as const) {
      expect(typeof log[key]).toBe('number');
    }

    // Old dashboard fields keep their shape.
    const summary = await client.dashboard.summary.query({ localDate: date, localHour: 6 });
    for (const key of ['nextMeal', 'restOfToday', 'weekPlan', 'nutrition', 'today'] as const) {
      expect(summary).toHaveProperty(key);
    }
    expect(typeof summary.today.date).toBe('string');
    expect(summary.today.dayOfWeek).toBe(todayIndex);
    expect(summary.nutrition.eatenKcal).toBe(1130);
    expect(typeof summary.nutrition.plannedKcal).toBe('number');
    expect(summary.nutrition.protein.eaten).toBe(40);
    expect(typeof summary.nutrition.protein.planned).toBe('number');
    expect(typeof summary.nutrition.protein.targetG).toBe('number');
  });
});
