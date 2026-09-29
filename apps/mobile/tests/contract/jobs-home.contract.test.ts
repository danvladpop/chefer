import { beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// §2.4 (T-03.1/T-04.1/T-04.2) jobs API + home-display preference + the
// opt-in dashboard.summary fields, against the REAL API through the app's
// link stack. Registers ONE throwaway user per run (auth rate limit:
// 10 register/login per 15 min per IP — don't add more registrations here).

const { client, setToken } = makeContractClient();

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('jobs-home'),
    password: 'Contract@123!',
    firstName: 'JobsHome',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
});

describe('preferences.setJobs (T-03.1)', () => {
  it('setJobs then preferences.get returns the jobs and the legacy intent', async () => {
    const result = await client.preferences.setJobs.mutate({ jobs: ['TRAIN', 'PLAN_MEALS'] });
    expect(result.jobs).toEqual(['TRAIN', 'PLAN_MEALS']);
    expect(result.intent).toBe('TRAIN'); // first job with a legacy equivalent

    const prefs = await client.preferences.get.query();
    expect(prefs.jobs).toEqual(['TRAIN', 'PLAN_MEALS']);
    expect(prefs.chefProfile?.onboardingIntent).toBe('TRAIN');
  });

  it('leaves the legacy intent untouched when no job maps to one', async () => {
    await client.preferences.setJobs.mutate({ jobs: ['TRACK'] });
    const prefs = await client.preferences.get.query();
    expect(prefs.jobs).toEqual(['TRACK']);
  });

  it('setIntent back-fills jobs for a first-time answer (a fresh account)', async () => {
    const fresh = makeContractClient();
    const user = await fresh.client.auth.register.mutate({
      email: uniqueEmail('jobs-home-intent'),
      password: 'Contract@123!',
      firstName: 'Intent',
      ...CONTRACT_CONSENT,
    });
    if (!user.session) throw new Error('register response is missing the session credential');
    fresh.setToken(user.session.token);

    await fresh.client.preferences.setIntent.mutate({ intent: 'HOUSEHOLD' });
    const prefs = await fresh.client.preferences.get.query();
    expect(prefs.jobs).toEqual(['HOUSEHOLD']);
  });
});

describe('preferences.setHomeDisplay (T-04.1)', () => {
  it('stores the explicit override and dashboard.summary reflects it', async () => {
    const off = await client.preferences.setHomeDisplay.mutate({ showNutritionOnToday: false });
    expect(off.showNutritionOnToday).toBe(false);
    const summaryOff = await client.dashboard.summary.query();
    expect(summaryOff.showNutrition).toBe(false);

    const on = await client.preferences.setHomeDisplay.mutate({ showNutritionOnToday: true });
    expect(on.showNutritionOnToday).toBe(true);
    const summaryOn = await client.dashboard.summary.query();
    expect(summaryOn.showNutrition).toBe(true);
  });
});

describe('dashboard.summary additive fields (T-04.2)', () => {
  it('always includes planId, jobs and showNutrition, with no `include`', async () => {
    const summary = await client.dashboard.summary.query();
    expect(summary).toHaveProperty('planId');
    expect(Array.isArray(summary.jobs)).toBe(true);
    expect(typeof summary.showNutrition).toBe('boolean');
    // Opt-in fields are absent for an old-shaped request — additive, no cost.
    expect(summary.tonight).toBeUndefined();
    expect(summary.tomorrow).toBeUndefined();
    expect(summary.shopDue).toBeUndefined();
    expect(summary.planVsTarget).toBeUndefined();
    expect(summary.pendingTargetChange).toBeUndefined();
  });

  it('include asks for the opt-in fields without erroring, even with no plan', async () => {
    const summary = await client.dashboard.summary.query({
      include: ['tonight', 'tomorrow', 'shopDue', 'safetyChecks', 'targets'],
    });
    expect(summary).toHaveProperty('tonight');
    expect(summary).toHaveProperty('tomorrow');
    expect(summary).toHaveProperty('shopDue');
    expect(summary).toHaveProperty('planVsTarget');
    expect(summary).toHaveProperty('pendingTargetChange');
  });
});
