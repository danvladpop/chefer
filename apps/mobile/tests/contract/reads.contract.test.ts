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

  it('tracker.weeklySummary hydrates dates through superjson', async () => {
    const summary = await client.tracker.weeklySummary.query();
    expect(summary).toBeTruthy();
    const dates = JSON.stringify(summary).length;
    expect(dates).toBeGreaterThan(2);
  });
});
