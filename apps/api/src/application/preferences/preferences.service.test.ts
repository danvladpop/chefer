import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChefProfileRepository, IDietaryPreferencesRepository } from '@chefer/database';
import {
  computeCalorieTarget,
  mergeSafetyList,
  PreferencesService,
  resolveDailyTargets,
} from './preferences.service.js';

// ─── Mock @chefer/database so prisma.$transaction is controllable ─────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      $transaction: vi.fn().mockResolvedValue(undefined),
      chefProfile: { upsert: vi.fn() },
      dietaryPreferences: { upsert: vi.fn() },
    },
    chefProfileRepository: { findByUserId: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    dietaryPreferencesRepository: { findByUserId: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  };
});

// ─── Re-import prisma after mock so we can configure it per-test ──────────────
const { prisma } = await import('@chefer/database');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-01T00:00:00.000Z');

const CHEF_PROFILE_FIXTURE = {
  id: 'cp1',
  userId: 'user1',
  displayName: null,
  goal: 'LOSE_WEIGHT' as const,
  age: 30,
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'MODERATELY_ACTIVE' as const,
  dailyCalorieTarget: 2321,
  updatedAt: NOW,
};

const DIETARY_PREFS_FIXTURE = {
  id: 'dp1',
  userId: 'user1',
  cuisinePreferences: ['Italian'],
  dietaryRestrictions: ['Vegan'],
  allergies: ['peanuts'],
  dislikedIngredients: ['Onions'],
  mealsPerDay: 3,
  servingSize: 2,
  updatedAt: NOW,
};

// ─── Repo factory helpers ─────────────────────────────────────────────────────

function makeChefProfileRepo(
  overrides: Partial<IChefProfileRepository> = {},
): IChefProfileRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeDietaryPreferencesRepo(
  overrides: Partial<IDietaryPreferencesRepository> = {},
): IDietaryPreferencesRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

// ─── hasProfile ───────────────────────────────────────────────────────────────

describe('PreferencesService.hasProfile', () => {
  it('returns true when a ChefProfile exists for the user', async () => {
    const chefProfileRepo = makeChefProfileRepo({
      findByUserId: vi.fn().mockResolvedValue(CHEF_PROFILE_FIXTURE),
    });
    const service = new PreferencesService(chefProfileRepo, makeDietaryPreferencesRepo());

    await expect(service.hasProfile('user1')).resolves.toBe(true);
    expect(chefProfileRepo.findByUserId).toHaveBeenCalledWith('user1');
  });

  it('returns false when no ChefProfile exists', async () => {
    const chefProfileRepo = makeChefProfileRepo({
      findByUserId: vi.fn().mockResolvedValue(null),
    });
    const service = new PreferencesService(chefProfileRepo, makeDietaryPreferencesRepo());

    await expect(service.hasProfile('user1')).resolves.toBe(false);
  });

  it('returns false for a bare row without a goal (registration display defaults)', async () => {
    const chefProfileRepo = makeChefProfileRepo({
      findByUserId: vi.fn().mockResolvedValue({ ...CHEF_PROFILE_FIXTURE, goal: null }),
    });
    const service = new PreferencesService(chefProfileRepo, makeDietaryPreferencesRepo());

    await expect(service.hasProfile('user1')).resolves.toBe(false);
  });
});

// ─── get ──────────────────────────────────────────────────────────────────────

describe('PreferencesService.get', () => {
  it('returns combined chefProfile and dietaryPreferences', async () => {
    const service = new PreferencesService(
      makeChefProfileRepo({ findByUserId: vi.fn().mockResolvedValue(CHEF_PROFILE_FIXTURE) }),
      makeDietaryPreferencesRepo({
        findByUserId: vi.fn().mockResolvedValue(DIETARY_PREFS_FIXTURE),
      }),
    );

    const result = await service.get('user1');

    expect(result.chefProfile).toEqual(CHEF_PROFILE_FIXTURE);
    expect(result.dietaryPreferences).toEqual(DIETARY_PREFS_FIXTURE);
  });

  it('returns null for both when the user has no saved preferences', async () => {
    const service = new PreferencesService(makeChefProfileRepo(), makeDietaryPreferencesRepo());

    const result = await service.get('new-user');

    expect(result.chefProfile).toBeNull();
    expect(result.dietaryPreferences).toBeNull();
  });

  it('calls both repositories with the correct userId', async () => {
    const chefProfileRepo = makeChefProfileRepo();
    const dietaryPreferencesRepo = makeDietaryPreferencesRepo();
    const service = new PreferencesService(chefProfileRepo, dietaryPreferencesRepo);

    await service.get('user42');

    expect(chefProfileRepo.findByUserId).toHaveBeenCalledWith('user42');
    expect(dietaryPreferencesRepo.findByUserId).toHaveBeenCalledWith('user42');
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('PreferencesService.update', () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined);
  });

  it('wraps writes in a prisma transaction', async () => {
    const chefProfileRepo = makeChefProfileRepo({
      findByUserId: vi.fn().mockResolvedValue(CHEF_PROFILE_FIXTURE),
    });
    const service = new PreferencesService(chefProfileRepo, makeDietaryPreferencesRepo());

    await service.update('user1', { mealsPerDay: 4 });

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('throws INTERNAL_SERVER_ERROR when the transaction fails', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('DB unavailable'));

    const chefProfileRepo = makeChefProfileRepo({
      findByUserId: vi.fn().mockResolvedValue(CHEF_PROFILE_FIXTURE),
    });
    const service = new PreferencesService(chefProfileRepo, makeDietaryPreferencesRepo());

    await expect(service.update('user1', { mealsPerDay: 4 })).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('resolveDailyTargets', () => {
  const METRICS = {
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activityLevel: 'MODERATELY_ACTIVE',
    biologicalSex: 'MALE',
    goal: 'MAINTAIN',
    dailyCalorieTarget: 1500, // stale snapshot — must be ignored when metrics are complete
  };

  it('computes live TDEE when body metrics are complete, ignoring the snapshot', () => {
    const targets = resolveDailyTargets(METRICS);
    const expected = computeCalorieTarget(80, 180, 30, 'MODERATELY_ACTIVE', 'MALE', 'MAINTAIN');
    expect(targets.dailyCalorieTarget).toBe(expected);
    expect(targets.dailyCalorieTarget).not.toBe(1500);
  });

  it('changing the goal changes the target — the F-5 consistency case', () => {
    const maintain = resolveDailyTargets(METRICS);
    const lose = resolveDailyTargets({ ...METRICS, goal: 'LOSE_WEIGHT' });
    expect(lose.dailyCalorieTarget).toBe(maintain.dailyCalorieTarget - 500);
    // The macro split changes with the goal too (35/35/30 vs 25/45/30).
    expect(lose.proteinG).toBeGreaterThan(Math.round((lose.dailyCalorieTarget * 0.25) / 4));
  });

  it('falls back to the stored snapshot when metrics are incomplete', () => {
    const targets = resolveDailyTargets({ ...METRICS, weightKg: null });
    expect(targets.dailyCalorieTarget).toBe(1500);
  });

  it('defaults to 2000 kcal with no profile at all', () => {
    const targets = resolveDailyTargets(null);
    expect(targets.dailyCalorieTarget).toBe(2000);
    // MAINTAIN split: 25% protein / 45% carbs / 30% fat
    expect(targets.proteinG).toBe(125);
    expect(targets.carbsG).toBe(225);
    expect(targets.fatG).toBe(67);
  });

  it('macro grams are internally consistent with the calorie target', () => {
    const t = resolveDailyTargets(METRICS);
    const kcalFromMacros = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    // Rounding each macro independently can drift a few kcal.
    expect(Math.abs(kcalFromMacros - t.dailyCalorieTarget)).toBeLessThan(20);
  });

  it('caps protein at 2.2 g/kg and moves the freed calories into carbs (#8)', () => {
    // The E2E case: 75 kg gain-muscle at ~2,982 kcal gave 261 g protein
    // (3.5 g/kg) from the raw 35% split.
    const t = resolveDailyTargets({
      ...METRICS,
      weightKg: 75,
      goal: 'GAIN_MUSCLE',
      dailyCalorieTarget: null,
    });
    expect(t.proteinG).toBe(Math.round(75 * 2.2)); // 165, not 261
    // Calories stay accounted for — the cap redistributes, not deletes.
    const kcalFromMacros = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(Math.abs(kcalFromMacros - t.dailyCalorieTarget)).toBeLessThan(20);
  });

  it('no cap without a known body weight — the snapshot path keeps its split', () => {
    const t = resolveDailyTargets({ ...METRICS, weightKg: null, goal: 'GAIN_MUSCLE' });
    // 1500-kcal snapshot at 35% protein = 131 g; no weight → no cap applied.
    expect(t.proteinG).toBe(Math.round((1500 * 0.35) / 4));
  });
});

// ─── Adaptive Chef dial ordering (F1 — premium_plan.md W1-A) ─────────────────
// Contract: targetAdjustmentKcal applies AFTER the goal adjustment and BEFORE
// the protein cap. resolveDailyTargets is the only place the dial folds in.

describe('resolveDailyTargets — targetAdjustmentKcal ordering', () => {
  const METRICS = {
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activityLevel: 'MODERATELY_ACTIVE',
    biologicalSex: 'MALE',
    goal: 'LOSE_WEIGHT',
    dailyCalorieTarget: null,
  };

  it('applies the dial ON TOP of the goal adjustment (not instead of it)', () => {
    const withoutDial = resolveDailyTargets(METRICS);
    const withDial = resolveDailyTargets({ ...METRICS, targetAdjustmentKcal: -100 });
    // Goal adjustment (−500 for LOSE) is already inside withoutDial; the dial
    // subtracts a further 100.
    expect(withDial.dailyCalorieTarget).toBe(withoutDial.dailyCalorieTarget - 100);
    const maintain = resolveDailyTargets({ ...METRICS, goal: 'MAINTAIN' });
    expect(withDial.dailyCalorieTarget).toBe(maintain.dailyCalorieTarget - 500 - 100);
  });

  it('a dial of 0 (the ChefProfile default) changes nothing', () => {
    expect(resolveDailyTargets({ ...METRICS, targetAdjustmentKcal: 0 })).toEqual(
      resolveDailyTargets(METRICS),
    );
  });

  it('the protein cap runs AFTER the dial — capped grams ignore the dial size', () => {
    // 75 kg GAIN_MUSCLE blows past the 2.2 g/kg cap with or without a dial;
    // if the cap ran before the dial the freed-calorie redistribution would
    // be computed on the wrong calorie base.
    const base = resolveDailyTargets({ ...METRICS, weightKg: 75, goal: 'GAIN_MUSCLE' });
    const dialed = resolveDailyTargets({
      ...METRICS,
      weightKg: 75,
      goal: 'GAIN_MUSCLE',
      targetAdjustmentKcal: 200,
    });
    expect(dialed.dailyCalorieTarget).toBe(base.dailyCalorieTarget + 200);
    // Cap still binds at the same gram ceiling…
    expect(dialed.proteinG).toBe(Math.round(75 * 2.2));
    // …and the dial's calories land in carbs, keeping the books balanced.
    const kcalFromMacros = dialed.proteinG * 4 + dialed.carbsG * 4 + dialed.fatG * 9;
    expect(Math.abs(kcalFromMacros - dialed.dailyCalorieTarget)).toBeLessThan(20);
  });

  it('applies the dial to the snapshot path too (incomplete metrics)', () => {
    const t = resolveDailyTargets({
      ...METRICS,
      weightKg: null,
      dailyCalorieTarget: 1800,
      targetAdjustmentKcal: 100,
    });
    expect(t.dailyCalorieTarget).toBe(1900);
  });

  it('never lets the dial push the target below the 1200 kcal safety floor', () => {
    const t = resolveDailyTargets({
      ...METRICS,
      weightKg: null,
      dailyCalorieTarget: 1250,
      targetAdjustmentKcal: -300,
    });
    expect(t.dailyCalorieTarget).toBe(1200);
  });
});

// ─── setup never shrinks safety (audit F-ONB-1-1) ─────────────────────────────

describe('PreferencesService.setup — safety lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const SETUP_INPUT = {
    goal: 'MAINTAIN' as const,
    biologicalSex: 'FEMALE' as const,
    age: 34,
    heightCm: 168,
    weightKg: 62,
    activityLevel: 'LIGHTLY_ACTIVE' as const,
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: ['Thai'],
    mealsPerDay: 3,
    servingSize: 1,
  };

  it('keeps saved allergies when the wizard submits an empty list', async () => {
    const service = new PreferencesService(
      makeChefProfileRepo(),
      makeDietaryPreferencesRepo({
        findByUserId: vi.fn().mockResolvedValue({
          ...DIETARY_PREFS_FIXTURE,
          allergies: ['Peanuts', 'Shellfish'],
        }),
      }),
    );

    await service.setup('user1', SETUP_INPUT);

    const call = vi.mocked(prisma.dietaryPreferences.upsert).mock.calls[0]![0];
    expect(call.update.allergies).toEqual(['Peanuts', 'Shellfish']);
    expect(call.update.dietaryRestrictions).toEqual(['Vegan']);
    expect(call.update.dislikedIngredients).toEqual(['Onions']);
    expect(call.update.cuisinePreferences).toEqual(['Thai']);
  });

  it('adds newly submitted allergies to the saved ones', async () => {
    const service = new PreferencesService(
      makeChefProfileRepo(),
      makeDietaryPreferencesRepo({
        findByUserId: vi.fn().mockResolvedValue(DIETARY_PREFS_FIXTURE),
      }),
    );

    await service.setup('user1', { ...SETUP_INPUT, allergies: ['Peanuts', 'Sesame'] });

    const call = vi.mocked(prisma.dietaryPreferences.upsert).mock.calls[0]![0];
    expect(call.update.allergies).toEqual(['peanuts', 'Sesame']);
  });
});

describe('mergeSafetyList', () => {
  it('unions case-insensitively, saved entries first, trimming blanks', () => {
    expect(mergeSafetyList(['Peanuts'], [' peanuts ', 'Egg', '', 'egg'])).toEqual([
      'Peanuts',
      'Egg',
    ]);
    expect(mergeSafetyList(undefined, ['Soy'])).toEqual(['Soy']);
  });
});

// ─── setDisplayPreferences (backlog P2-6) ─────────────────────────────────────

describe('PreferencesService.setDisplayPreferences', () => {
  function build(gymSync = vi.fn().mockResolvedValue(undefined)) {
    const chefProfileRepo = makeChefProfileRepo({
      upsert: vi.fn((_u: string, data) =>
        Promise.resolve({
          ...CHEF_PROFILE_FIXTURE,
          preferredUnits: 'METRIC',
          deliveryCurrency: 'EUR',
          ...data,
        } as never),
      ),
    });
    const service = new PreferencesService(chefProfileRepo, makeDietaryPreferencesRepo(), {
      syncFromPreferredUnits: gymSync,
    });
    return { service, chefProfileRepo, gymSync };
  }

  it('upserts units and currency (currency lands in deliveryCurrency)', async () => {
    const { service, chefProfileRepo } = build();

    const result = await service.setDisplayPreferences('user1', {
      preferredUnits: 'IMPERIAL',
      currency: 'USD',
    });

    expect(chefProfileRepo.upsert).toHaveBeenCalledWith('user1', {
      preferredUnits: 'IMPERIAL',
      deliveryCurrency: 'USD',
    });
    expect(result).toEqual({ preferredUnits: 'IMPERIAL', currency: 'USD' });
  });

  it('moves the gym unit when the unit system changes', async () => {
    const { service, gymSync } = build();
    await service.setDisplayPreferences('user1', { preferredUnits: 'IMPERIAL' });
    expect(gymSync).toHaveBeenCalledWith('user1', 'IMPERIAL');
  });

  it('leaves the gym alone for a currency-only change', async () => {
    const { service, gymSync, chefProfileRepo } = build();
    await service.setDisplayPreferences('user1', { currency: 'GBP' });
    expect(chefProfileRepo.upsert).toHaveBeenCalledWith('user1', { deliveryCurrency: 'GBP' });
    expect(gymSync).not.toHaveBeenCalled();
  });

  it('still saves the preference when the gym sync fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = build(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(
      service.setDisplayPreferences('user1', { preferredUnits: 'METRIC' }),
    ).resolves.toEqual({ preferredUnits: 'METRIC', currency: 'EUR' });
    error.mockRestore();
  });

  it('reads an unknown stored currency back as EUR', async () => {
    const chefProfileRepo = makeChefProfileRepo({
      upsert: vi.fn().mockResolvedValue({
        ...CHEF_PROFILE_FIXTURE,
        preferredUnits: 'METRIC',
        deliveryCurrency: null,
      }),
    });
    const service = new PreferencesService(chefProfileRepo, makeDietaryPreferencesRepo());
    await expect(
      service.setDisplayPreferences('user1', { preferredUnits: 'METRIC' }),
    ).resolves.toEqual({ preferredUnits: 'METRIC', currency: 'EUR' });
  });

  it('syncs the gym when old apps change units through update()', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined);
    const gymSync = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService(makeChefProfileRepo(), makeDietaryPreferencesRepo(), {
      syncFromPreferredUnits: gymSync,
    });
    await service.update('user1', { preferredUnits: 'IMPERIAL' });
    expect(gymSync).toHaveBeenCalledWith('user1', 'IMPERIAL');

    gymSync.mockClear();
    await service.update('user1', { mealsPerDay: 4 });
    expect(gymSync).not.toHaveBeenCalled();
  });
});

// ─── One people model + intent (backlog P2-3) ─────────────────────────────────

describe('PreferencesService — household is the one people model (F-PM-8)', () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined);
  });

  const makeHousehold = (members: { portionFactor: number }[] = []) => ({
    list: vi.fn().mockResolvedValue(members),
    migrateLegacyServingSize: vi.fn().mockResolvedValue(0),
  });

  it('get() reports servingSize from the household, for app builds in the stores', async () => {
    const household = makeHousehold([{ portionFactor: 1 }, { portionFactor: 0.5 }]);
    const service = new PreferencesService(
      makeChefProfileRepo(),
      makeDietaryPreferencesRepo({
        findByUserId: vi.fn().mockResolvedValue({ ...DIETARY_PREFS_FIXTURE, servingSize: 1 }),
      }),
      undefined,
      household,
    );
    const result = await service.get('user1');
    expect(household.list).toHaveBeenCalledWith('user1');
    expect(result.dietaryPreferences?.servingSize).toBe(3);
  });

  it('get() of a solo user reports 1 even if a stale legacy value was stored', async () => {
    const service = new PreferencesService(
      makeChefProfileRepo(),
      makeDietaryPreferencesRepo({
        findByUserId: vi.fn().mockResolvedValue({ ...DIETARY_PREFS_FIXTURE, servingSize: 4 }),
      }),
      undefined,
      makeHousehold([]),
    );
    expect((await service.get('user1')).dietaryPreferences?.servingSize).toBe(1);
  });

  it('a servingSize > 1 from an old build is absorbed into the household', async () => {
    const household = makeHousehold();
    const service = new PreferencesService(
      makeChefProfileRepo(),
      makeDietaryPreferencesRepo(),
      undefined,
      household,
    );
    await service.update('user1', { servingSize: 3 });
    expect(household.migrateLegacyServingSize).toHaveBeenCalledWith('user1');

    household.migrateLegacyServingSize.mockClear();
    await service.update('user1', { servingSize: 1 });
    await service.update('user1', { mealsPerDay: 4 });
    expect(household.migrateLegacyServingSize).not.toHaveBeenCalled();
  });

  it('setup() without a servingSize leaves the column alone (current clients)', async () => {
    vi.mocked(prisma.dietaryPreferences.upsert).mockClear();
    const household = makeHousehold();
    const service = new PreferencesService(
      makeChefProfileRepo(),
      makeDietaryPreferencesRepo(),
      undefined,
      household,
    );
    await service.setup('user1', {
      goal: 'MAINTAIN',
      biologicalSex: 'FEMALE',
      age: 34,
      heightCm: 168,
      weightKg: 62,
      activityLevel: 'LIGHTLY_ACTIVE',
      dietaryRestrictions: [],
      allergies: [],
      dislikedIngredients: [],
      cuisinePreferences: [],
      mealsPerDay: 3,
    });
    const call = vi.mocked(prisma.dietaryPreferences.upsert).mock.calls[0]![0];
    expect(call.update).not.toHaveProperty('servingSize');
    expect(call.create).not.toHaveProperty('servingSize');
    expect(household.migrateLegacyServingSize).not.toHaveBeenCalled();
  });
});

describe('PreferencesService.setIntent (F-PM-6)', () => {
  it('stores the onboarding intent on the chef profile', async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ ...CHEF_PROFILE_FIXTURE, goal: null, onboardingIntent: 'TRAIN' });
    const service = new PreferencesService(
      makeChefProfileRepo({ upsert }),
      makeDietaryPreferencesRepo(),
    );
    await expect(service.setIntent('user1', 'TRAIN')).resolves.toEqual({ intent: 'TRAIN' });
    expect(upsert).toHaveBeenCalledWith('user1', { onboardingIntent: 'TRAIN' });
  });
});
