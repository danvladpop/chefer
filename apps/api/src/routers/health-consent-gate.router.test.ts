import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userRepository } from '@chefer/database';
import { HEALTH_CONSENT_API_LEVEL, type UserProfile } from '@chefer/types';
import { householdRouter } from './household.router.js';
import { preferencesRouter } from './preferences.router.js';
import { trackerRouter } from './tracker.router.js';

// T-26.3 / UX-26 AC1 — the gate on real procedures. The critical contract:
// `preferences.updateSafety` without consent succeeds under `off`; under
// `declared` it is rejected ONLY for a client declaring the new API level and
// ACCEPTED without the header (the installed-binary case). Services are mocked.

const enforce = vi.hoisted(() => ({ mode: 'off' }));
vi.mock('../lib/env.js', () => ({
  // Standalone (the real env.ts throws without secrets): only the mode is read.
  env: new Proxy(
    {},
    {
      get: (_target, key) => (key === 'HEALTH_CONSENT_ENFORCE' ? enforce.mode : undefined),
    },
  ),
}));
vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, userRepository: { findHealthConsentAt: vi.fn() } };
});
const svc = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue({ ok: true }),
  setup: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../application/preferences/preferences.service.js', () => ({
  preferencesService: svc,
  computeMacroTargets: vi.fn(),
}));
const household = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue({ id: 'm1' }),
  update: vi.fn().mockResolvedValue({ id: 'm1' }),
}));
vi.mock('../application/household/household.service.js', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../application/household/household.service.js')>();
  return { ...mod, householdService: household };
});
const tracker = vi.hoisted(() => ({
  logWeight: vi.fn().mockResolvedValue({ id: 'w1' }),
  updateWeight: vi.fn().mockResolvedValue({ id: 'w1' }),
}));
vi.mock('../application/tracker/tracker.service.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../application/tracker/tracker.service.js')>();
  return { ...mod, trackerService: tracker };
});
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const user: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'PREMIUM',
  image: null,
};
const ctxAt = (clientApiLevel: number) => ({
  user,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel,
  res: {} as Response,
});
const NEW = HEALTH_CONSENT_API_LEVEL;
const noHeader = 0;
const safety = { allergies: ['Peanuts'], dietaryRestrictions: [], dislikedIngredients: [] };

beforeEach(() => {
  vi.clearAllMocks();
  enforce.mode = 'off';
  vi.mocked(userRepository.findHealthConsentAt).mockResolvedValue(null);
});

describe('preferences.updateSafety — the installed-binary contract', () => {
  it('off: accepted without consent, at any level', async () => {
    for (const level of [noHeader, 3, NEW]) {
      await expect(
        preferencesRouter.createCaller(ctxAt(level)).updateSafety(safety),
      ).resolves.toBeDefined();
    }
    expect(svc.update).toHaveBeenCalledTimes(3);
  });

  it('declared: rejected ONLY for the new API level', async () => {
    enforce.mode = 'declared';
    await expect(
      preferencesRouter.createCaller(ctxAt(NEW)).updateSafety(safety),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'HEALTH_CONSENT_REQUIRED',
    });
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('declared: ACCEPTED without the header and at pre-sheet levels (installed binaries)', async () => {
    enforce.mode = 'declared';
    await expect(
      preferencesRouter.createCaller(ctxAt(noHeader)).updateSafety(safety),
    ).resolves.toBeDefined();
    await expect(
      preferencesRouter.createCaller(ctxAt(3)).updateSafety(safety),
    ).resolves.toBeDefined();
    expect(svc.update).toHaveBeenCalledTimes(2);
  });

  it('declared: accepted for the new level once consent is on record', async () => {
    enforce.mode = 'declared';
    vi.mocked(userRepository.findHealthConsentAt).mockResolvedValue(new Date());
    await expect(
      preferencesRouter.createCaller(ctxAt(NEW)).updateSafety(safety),
    ).resolves.toBeDefined();
  });

  it('declared: clearing the lists needs no consent (nothing health-related is stored)', async () => {
    enforce.mode = 'declared';
    await expect(
      preferencesRouter
        .createCaller(ctxAt(NEW))
        .updateSafety({ allergies: [], dietaryRestrictions: [], dislikedIngredients: [] }),
    ).resolves.toBeDefined();
  });

  it('all: rejects every client, even without the header', async () => {
    enforce.mode = 'all';
    await expect(
      preferencesRouter.createCaller(ctxAt(noHeader)).updateSafety(safety),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});

describe('the other health-write procedures under declared, new client, no consent', () => {
  beforeEach(() => {
    enforce.mode = 'declared';
  });

  it('preferences.saveProfileBasics rejects body data, accepts an empty patch', async () => {
    const caller = preferencesRouter.createCaller(ctxAt(NEW));
    await expect(
      caller.saveProfileBasics({ goal: 'MAINTAIN', weightKg: 70 }),
    ).rejects.toMatchObject({
      message: 'HEALTH_CONSENT_REQUIRED',
    });
    await expect(caller.saveProfileBasics({})).resolves.toBeDefined();
  });

  it('preferences.updateTargets gates body fields only', async () => {
    const caller = preferencesRouter.createCaller(ctxAt(NEW));
    await expect(caller.updateTargets({ weightKg: 80 })).rejects.toMatchObject({
      message: 'HEALTH_CONSENT_REQUIRED',
    });
    await expect(caller.updateTargets({ mealsPerDay: 4 })).resolves.toBeDefined();
  });

  it('preferences.setup is always health data', async () => {
    await expect(
      preferencesRouter.createCaller(ctxAt(NEW)).setup({
        goal: 'MAINTAIN',
        biologicalSex: 'FEMALE',
        age: 30,
        heightCm: 170,
        weightKg: 65,
        activityLevel: 'LIGHTLY_ACTIVE',
        dietaryRestrictions: [],
        allergies: [],
        dislikedIngredients: [],
        cuisinePreferences: [],
        mealsPerDay: 3,
      }),
    ).rejects.toMatchObject({ message: 'HEALTH_CONSENT_REQUIRED' });
    expect(svc.setup).not.toHaveBeenCalled();
  });

  it('household.add/update reject allergies but accept a member with no health data', async () => {
    const caller = householdRouter.createCaller(ctxAt(NEW));
    await expect(caller.add({ name: 'Mia', allergies: ['Peanuts'] })).rejects.toMatchObject({
      message: 'HEALTH_CONSENT_REQUIRED',
    });
    await expect(caller.add({ name: 'Mia', portionFactor: 0.5 })).resolves.toBeDefined();
    await expect(
      caller.update({ id: 'ckabcdefghijklmnopqrstuvw', dietaryRestrictions: ['Vegan'] }),
    ).rejects.toMatchObject({ message: 'HEALTH_CONSENT_REQUIRED' });
    await expect(
      caller.update({ id: 'ckabcdefghijklmnopqrstuvw', name: 'Mia B' }),
    ).resolves.toBeDefined();
  });

  it('tracker.logWeight / updateWeight are rejected for the new level, accepted for installed binaries', async () => {
    await expect(
      trackerRouter.createCaller(ctxAt(NEW)).logWeight({ weightKg: 70 }),
    ).rejects.toMatchObject({
      message: 'HEALTH_CONSENT_REQUIRED',
    });
    await expect(
      trackerRouter.createCaller(ctxAt(NEW)).updateWeight({ id: 'w1', weightKg: 70 }),
    ).rejects.toMatchObject({ message: 'HEALTH_CONSENT_REQUIRED' });
    await expect(
      trackerRouter.createCaller(ctxAt(noHeader)).logWeight({ weightKg: 70 }),
    ).resolves.toBeDefined();
  });
});
