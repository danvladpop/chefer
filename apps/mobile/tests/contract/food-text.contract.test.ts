import { beforeAll, describe, expect, it } from 'vitest';
import { makeUser, type ContractUser } from './friends-helpers';

// Lane A4: typed "I ate…" logging. parseFoodText splits and matches (nothing
// logged), logItems writes the reviewed items; AI consent first; free 10 a day.
// Expects the API in AI mock mode (AI_MOCK_ENABLED=true, as CI and lanes run).

const TODAY = new Date().toISOString().slice(0, 10);
let user: ContractUser;

beforeAll(async () => {
  user = await makeUser({ prefix: 'food-text-contract' });
}, 60_000);

describe('typed food logging (lane A4)', () => {
  it('without AI consent the parse is refused', async () => {
    await expect(user.api.tracker.parseFoodText.mutate({ text: '2 eggs' })).rejects.toMatchObject({
      data: { code: 'FORBIDDEN' },
    });
  });

  it('parses into reviewable items and logs the chosen ones', async () => {
    await user.api.user.grantAiDataConsent.mutate();
    const { items } = await user.api.tracker.parseFoodText.mutate({
      text: '2 eggs, toast with butter',
    });
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items) {
      expect(['recent', 'product', 'ingredient', 'estimate']).toContain(item.source);
      if (item.unit === 'g') expect(item.per100g.kcal).toBeGreaterThanOrEqual(0);
    }
    const logged = await user.api.tracker.logItems.mutate({
      date: TODAY,
      mealType: 'breakfast',
      items: [
        {
          name: 'Egg, 100 g',
          estimatedBy: 'manual',
          kcal: 143,
          protein: 12.6,
          carbs: 0.7,
          fat: 9.5,
        },
        {
          name: 'Toast, 30 g',
          estimatedBy: 'vision',
          kcal: 87,
          protein: 2.7,
          carbs: 15.6,
          fat: 1.2,
        },
      ],
      rebalanceMode: 'preview',
    });
    expect(logged.entryIds).toHaveLength(2);
    const day = await user.api.tracker.getDay.query({ date: TODAY });
    const mine = (day.log?.loggedMeals ?? []).filter((m) =>
      logged.entryIds.includes(m.entryId ?? ''),
    );
    expect(mine.map((m) => m.custom?.estimatedBy)).toEqual(['manual', 'vision']);
  });

  it('a free user gets 10 parses a day, then TOO_MANY_REQUESTS', async () => {
    // One parse already happened above.
    for (let i = 0; i < 9; i++) {
      await user.api.tracker.parseFoodText.mutate({ text: 'coffee' });
    }
    await expect(user.api.tracker.parseFoodText.mutate({ text: 'coffee' })).rejects.toMatchObject({
      data: { code: 'TOO_MANY_REQUESTS' },
    });
  }, 60_000);
});
