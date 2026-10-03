import { beforeAll, describe, expect, it } from 'vitest';
import { makeContractClient, SEED_EMAIL, SEED_PASSWORD } from './client';

// UX-FOOD-20: the Progress screen's range control. `tracker.monthlySummary`
// takes an optional `days` (7–90); builds in the field send none and get 28.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.login.mutate({ email: SEED_EMAIL, password: SEED_PASSWORD });
  if (!user.session) {
    throw new Error('mobile login response is missing the session credential');
  }
  setToken(user.session.token);
});

describe('tracker.monthlySummary window (UX-FOOD-20)', () => {
  it('keeps the 28-day default for clients that send no `days`', async () => {
    const summary = await client.tracker.monthlySummary.query();
    expect(summary.days).toHaveLength(28);
    expect(typeof summary.dailyCalorieTarget).toBe('number');
  });

  it('serves the 7 / 28 / 90-day windows, ending on the client date', async () => {
    const localDate = new Date().toISOString().slice(0, 10);
    for (const days of [7, 28, 90]) {
      const summary = await client.tracker.monthlySummary.query({ localDate, days });
      expect(summary.days).toHaveLength(days);
      expect(summary.days.at(-1)?.date).toBe(localDate);
    }
  });

  it('rejects an out-of-range window', async () => {
    await expect(client.tracker.monthlySummary.query({ days: 365 })).rejects.toThrow();
  });
});
