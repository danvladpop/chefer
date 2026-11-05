import { beforeAll, describe, expect, it } from 'vitest';
import { localDateStr } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// Lane D2 (market review 2026-10): "Partly logged day" and the review's
// explanation, against the REAL API through the app's own tRPC link. Runs on
// a throwaway FREE account.

const { client, setToken } = makeContractClient();

const date = localDateStr(new Date());

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('explained-coach'),
    password: 'Contract@123!',
    firstName: 'Coach',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
}, 60_000);

describe('tracker.setDayIncomplete', () => {
  it('a new day reads not partly logged', async () => {
    const day = await client.tracker.getDay.query({ date });
    expect(day.incomplete).toBe(false);
  });

  it('marks and clears the day, and getDay follows', async () => {
    await client.tracker.logCustomMeal.mutate({
      date,
      name: 'Porridge',
      estimatedBy: 'manual',
      mealType: 'breakfast',
      kcal: 350,
      protein: 12,
      carbs: 55,
      fat: 8,
    });

    await expect(
      client.tracker.setDayIncomplete.mutate({ date, incomplete: true }),
    ).resolves.toEqual({ date, incomplete: true });
    const marked = await client.tracker.getDay.query({ date });
    expect(marked.incomplete).toBe(true);
    // The entries are untouched.
    expect(marked.log?.totalKcal).toBe(350);

    await client.tracker.setDayIncomplete.mutate({ date, incomplete: false });
    expect((await client.tracker.getDay.query({ date })).incomplete).toBe(false);
  });

  it('rejects a future day', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    await expect(
      client.tracker.setDayIncomplete.mutate({ date: localDateStr(future), incomplete: true }),
    ).rejects.toThrow();
  });
});

describe('coach.currentReview', () => {
  it('a new account has no review yet (the explanation field is additive)', async () => {
    const review = await client.coach.currentReview.query();
    expect(review.status).toBe('none');
  });
});
