import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { preferencesRouter } from './preferences.router.js';

// Backlog P2-6 / audit F-DASH-3-2: units + currency are editable on EVERY
// tier through setDisplayPreferences. The service is mocked, so these tests
// exercise the procedure's gating and zod input only.
const svc = vi.hoisted(() => ({
  setDisplayPreferences: vi.fn(),
  update: vi.fn(),
  setAutoPlanWeekly: vi.fn(),
  setup: vi.fn(),
}));
vi.mock('../application/preferences/preferences.service.js', () => ({
  preferencesService: svc,
  computeMacroTargets: vi.fn(),
}));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const freeUser: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const caller = preferencesRouter.createCaller({
  user: freeUser,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: false,
  clientApiLevel: 0,
  res: {} as Response,
});
const mobileCaller = preferencesRouter.createCaller({
  user: freeUser,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel: 0,
  res: {} as Response,
});
const premiumUser: UserProfile = { ...freeUser, planTier: 'PREMIUM' };
const premiumCaller = preferencesRouter.createCaller({
  user: premiumUser,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: false,
  clientApiLevel: 0,
  res: {} as Response,
});
const premiumLevel1Caller = preferencesRouter.createCaller({
  user: premiumUser,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: false,
  clientApiLevel: 1,
  res: {} as Response,
});
// Level 2 = wave-1 JS; level 1 is the wave-0 app already on phones.
const premiumLevel2Caller = preferencesRouter.createCaller({
  user: premiumUser,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: false,
  clientApiLevel: 2,
  res: {} as Response,
});

describe('preferences.setDisplayPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.setDisplayPreferences.mockResolvedValue({ preferredUnits: 'IMPERIAL', currency: 'USD' });
  });

  it('lets a FREE user change units and currency', async () => {
    const result = await caller.setDisplayPreferences({
      preferredUnits: 'IMPERIAL',
      currency: 'USD',
    });
    expect(result).toEqual({ preferredUnits: 'IMPERIAL', currency: 'USD' });
    expect(svc.setDisplayPreferences).toHaveBeenCalledWith('u1', {
      preferredUnits: 'IMPERIAL',
      currency: 'USD',
    });
  });

  it('accepts either field alone', async () => {
    await caller.setDisplayPreferences({ currency: 'RON' });
    await caller.setDisplayPreferences({ preferredUnits: 'METRIC' });
    expect(svc.setDisplayPreferences).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty update and unsupported values', async () => {
    await expect(caller.setDisplayPreferences({})).rejects.toThrow(/Nothing to update/);
    await expect(caller.setDisplayPreferences({ currency: 'JPY' as never })).rejects.toThrow();
    await expect(caller.setDisplayPreferences({ preferredUnits: 'US' as never })).rejects.toThrow();
    expect(svc.setDisplayPreferences).not.toHaveBeenCalled();
  });

  it('keeps updateTargets premium-only (units still accepted there for old apps)', async () => {
    await expect(caller.updateTargets({ preferredUnits: 'IMPERIAL' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(svc.update).not.toHaveBeenCalled();
  });

  // §2.12, T-21.1
  it('accepts a valid IANA time zone and rejects a bogus one', async () => {
    await caller.setDisplayPreferences({ timeZone: 'Europe/Bucharest' });
    expect(svc.setDisplayPreferences).toHaveBeenCalledWith('u1', {
      timeZone: 'Europe/Bucharest',
    });
    await expect(caller.setDisplayPreferences({ timeZone: 'Not/AZone' })).rejects.toThrow();
  });
});

// §2.13, T-39.2: the toggle passes through the client's platform so the
// consent log (ConsentService.record, called inside the service) carries
// the right `source`.
describe('preferences.setAutoPlanWeekly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.setAutoPlanWeekly.mockResolvedValue({ autoPlanWeekly: true });
  });

  it('passes source "web" for a web client', async () => {
    await caller.setAutoPlanWeekly({ enabled: true });
    expect(svc.setAutoPlanWeekly).toHaveBeenCalledWith('u1', true, 'web');
  });

  it('passes source "mobile" for a mobile client', async () => {
    await mobileCaller.setAutoPlanWeekly({ enabled: true });
    expect(svc.setAutoPlanWeekly).toHaveBeenCalledWith('u1', true, 'mobile');
  });
});

// T-BUG-X4 (was 43): setup's safety arrays were uncapped, unlike the same
// fields on updateSafety (20/20/30). The cap now applies, but only rejects
// (BAD_REQUEST) for clients declaring x-chefer-api-level >= 1 — a level-0
// client is silently truncated so an installed binary keeps working.
describe('preferences.setup — safety array caps (T-BUG-X4)', () => {
  const SETUP_BASE = {
    goal: 'MAINTAIN' as const,
    biologicalSex: 'MALE' as const,
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE' as const,
    cuisinePreferences: [] as string[],
    mealsPerDay: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc.setup.mockResolvedValue(undefined);
  });

  it('a level-0 client sending 25 allergies is silently truncated to 20, not rejected', async () => {
    const allergies = Array.from({ length: 25 }, (_, i) => `allergy-${i}`);
    await premiumCaller.setup({
      ...SETUP_BASE,
      dietaryRestrictions: [],
      allergies,
      dislikedIngredients: [],
    });
    expect(svc.setup).toHaveBeenCalledTimes(1);
    const sent = svc.setup.mock.calls[0]![1];
    expect(sent.allergies).toHaveLength(20);
    expect(sent.allergies).toEqual(allergies.slice(0, 20));
  });

  it('the wave-0 app (level 1) sending 25 allergies is truncated, not rejected', async () => {
    const allergies = Array.from({ length: 25 }, (_, i) => `allergy-${i}`);
    await premiumLevel1Caller.setup({
      ...SETUP_BASE,
      dietaryRestrictions: [],
      allergies,
      dislikedIngredients: [],
    });
    expect(svc.setup.mock.calls[0]![1].allergies).toHaveLength(20);
  });

  it('a level-2 client sending 25 allergies is rejected (BAD_REQUEST)', async () => {
    const allergies = Array.from({ length: 25 }, (_, i) => `allergy-${i}`);
    await expect(
      premiumLevel2Caller.setup({
        ...SETUP_BASE,
        dietaryRestrictions: [],
        allergies,
        dislikedIngredients: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(svc.setup).not.toHaveBeenCalled();
  });

  it('a payload within the caps passes through untouched at any client level', async () => {
    await premiumLevel1Caller.setup({
      ...SETUP_BASE,
      dietaryRestrictions: ['Vegan'],
      allergies: ['peanuts'],
      dislikedIngredients: ['onions'],
    });
    expect(svc.setup).toHaveBeenCalledWith('u1', {
      ...SETUP_BASE,
      dietaryRestrictions: ['Vegan'],
      allergies: ['peanuts'],
      dislikedIngredients: ['onions'],
    });
  });
});

// §2.11, T-35.2: RECOMP/PERFORMANCE are additive goals. A level-0 client
// renders a fixed GOALS list that predates them.
describe('preferences.get — RECOMP/PERFORMANCE level-0 downgrade (T-35.2)', () => {
  const mockGet = (goal: string | null) => ({
    get: vi.fn().mockResolvedValue({
      chefProfile: goal === null ? null : { goal },
      dietaryPreferences: null,
    }),
  });

  it('a level-0 client sees MAINTAIN in chefProfile.goal, the true value in goalV2', async () => {
    Object.assign(svc, mockGet('RECOMP'));
    const result = await caller.get();
    expect(result.chefProfile?.goal).toBe('MAINTAIN');
    expect((result.chefProfile as { goalV2: string }).goalV2).toBe('RECOMP');
  });

  it('the wave-0 app (level 1) is downgraded too — it predates the new goals', async () => {
    Object.assign(svc, mockGet('PERFORMANCE'));
    const result = await premiumLevel1Caller.get();
    expect(result.chefProfile?.goal).toBe('MAINTAIN');
    expect((result.chefProfile as { goalV2: string }).goalV2).toBe('PERFORMANCE');
  });

  it('a level-2+ client sees the true goal in both fields', async () => {
    Object.assign(svc, mockGet('PERFORMANCE'));
    const result = await premiumLevel2Caller.get();
    expect(result.chefProfile?.goal).toBe('PERFORMANCE');
    expect((result.chefProfile as { goalV2: string }).goalV2).toBe('PERFORMANCE');
  });

  it('an original-four goal is never downgraded, at any client level', async () => {
    Object.assign(svc, mockGet('LOSE_WEIGHT'));
    const result = await caller.get();
    expect(result.chefProfile?.goal).toBe('LOSE_WEIGHT');
  });

  it('a null chefProfile passes through untouched', async () => {
    Object.assign(svc, mockGet(null));
    const result = await caller.get();
    expect(result.chefProfile).toBeNull();
  });
});
