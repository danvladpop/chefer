import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-06 (T-06.2/T-06.3): weekday kinds reach the plan payload and the
// dashboard summary, against the REAL API through the app's link stack.
// ONE throwaway registration per run (auth rate limit — don't add more).
// Defaults hold with no server flags: run kinds are MARKERS only (zero kcal)
// until `trainingBumpFree` widens the bump (Q-3), and the free tier never
// gets an applied bump without the flag.

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('training-days'),
    password: 'Contract@123!',
    firstName: 'Runner',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('training days in the plan payload and the summary', () => {
  it('a Saturday long run is a marker on the plan with no target change by default', async () => {
    await client.training.setDayKinds.mutate({ days: { '5': 'long_run' } });
    const generated = await client.mealPlan.generate.mutate({ weekOffset: 0 });
    const days = generated.trainingDays ?? [];
    const sat = days.find((d) => d.dayOfWeek === 5);
    expect(sat).toMatchObject({ kind: 'long_run', dayName: 'Saturday', done: false });
    expect(days.filter((d) => d.dayOfWeek !== 5)).toEqual([]);
    // Flag off / free: nothing applied, no kcal shown (the run bump is Q-3, off by default).
    expect(sat?.applied).toBe(false);
    expect(sat?.kcalBonus).toBe(0);
    expect(sat?.preRunSnack).toBeTruthy();

    const read = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
    expect(read?.trainingDays?.map((d) => d.dayOfWeek)).toEqual([5]);
  });

  it('dashboard.summary carries a 7-day weekGlance and two refuel snacks for a user who trains', async () => {
    const s = await client.dashboard.summary.query();
    expect(s.weekGlance).toHaveLength(7);
    expect(s.weekGlance?.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.weekGlance?.[5]?.training).toMatchObject({ kind: 'long_run', status: 'planned' });
    expect(s.refuelSnacks).toHaveLength(2);
  });

  it('clearing the kinds removes the markers and the glance', async () => {
    await client.training.setDayKinds.mutate({ days: { '5': null } });
    const read = await client.mealPlan.getForWeek.query({ weekOffset: 0 });
    expect(read?.trainingDays).toBeUndefined();
    const s = await client.dashboard.summary.query();
    expect(s.weekGlance).toBeUndefined();
  });
});
