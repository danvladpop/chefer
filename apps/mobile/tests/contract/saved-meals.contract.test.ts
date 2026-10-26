import { beforeAll, describe, expect, it } from 'vitest';
import { makeUser, type ContractUser } from './friends-helpers';

// Lane A2: save a logged meal, re-log it in one tap, copy one meal to another
// meal, and Undo with deleteEntries. A throwaway user; nothing touches alice.

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

let user: ContractUser;

beforeAll(async () => {
  user = await makeUser({ prefix: 'saved-meals-contract' });
  for (const [name, kcal] of [
    ['Contract porridge', 400],
    ['Contract coffee', 40],
  ] as const) {
    await user.api.tracker.logCustomMeal.mutate({
      date: YESTERDAY,
      name,
      estimatedBy: 'manual',
      mealType: 'breakfast',
      kcal,
      protein: 10,
      carbs: 20,
      fat: 5,
    });
  }
}, 60_000);

describe('saved meals + copy meal (lane A2)', () => {
  let savedId = '';

  it('createFromDay snapshots one meal; a second save with the same name is CONFLICT', async () => {
    const saved = await user.api.savedMeals.createFromDay.mutate({
      name: 'Weekday breakfast',
      date: YESTERDAY,
      mealType: 'breakfast',
    });
    savedId = saved.id;
    expect(saved.items.map((i) => i.name)).toEqual(['Contract porridge', 'Contract coffee']);
    expect(saved.totals.kcal).toBe(440);
    await expect(
      user.api.savedMeals.createFromDay.mutate({
        name: 'Weekday breakfast',
        date: YESTERDAY,
        mealType: 'breakfast',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    await expect(
      user.api.savedMeals.createFromDay.mutate({
        name: 'Empty',
        date: YESTERDAY,
        mealType: 'dinner',
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
  });

  it('logSavedMeal appends both items to the chosen meal and returns their ids', async () => {
    const logged = await user.api.tracker.logSavedMeal.mutate({
      date: TODAY,
      savedMealId: savedId,
      mealType: 'lunch',
      rebalanceMode: 'preview',
    });
    expect(logged.entryIds).toHaveLength(2);
    const day = await user.api.tracker.getDay.query({ date: TODAY });
    const lunch = (day.log?.loggedMeals ?? []).filter((m) =>
      logged.entryIds.includes(m.entryId ?? ''),
    );
    expect(lunch.map((m) => m.mealType)).toEqual(['lunch', 'lunch']);
    const [list] = await user.api.savedMeals.list.query();
    expect(list?.lastLoggedAt).not.toBeNull();
  });

  it('copyMeal copies only that meal; Undo deletes exactly the copies', async () => {
    const copied = await user.api.tracker.copyMeal.mutate({
      fromDate: YESTERDAY,
      fromMealType: 'breakfast',
      toDate: TODAY,
      toMealType: 'dinner',
      rebalanceMode: 'preview',
    });
    expect(copied.copiedEntryIds).toHaveLength(2);
    await user.api.tracker.deleteEntries.mutate({ date: TODAY, entryIds: copied.copiedEntryIds });
    const day = await user.api.tracker.getDay.query({ date: TODAY });
    expect((day.log?.loggedMeals ?? []).some((m) => m.mealType === 'dinner')).toBe(false);
    await expect(
      user.api.tracker.copyMeal.mutate({
        fromDate: TODAY,
        fromMealType: 'lunch',
        toDate: TODAY,
        toMealType: 'lunch',
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
  });

  it('delete removes it; logging it afterwards is NOT_FOUND', async () => {
    await expect(user.api.savedMeals.delete.mutate({ id: savedId })).resolves.toEqual({
      deleted: true,
    });
    await expect(
      user.api.tracker.logSavedMeal.mutate({
        date: TODAY,
        savedMealId: savedId,
        mealType: 'lunch',
      }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
  });
});
