import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChefProfileRepository, IDietaryPreferencesRepository } from '@chefer/database';
import { PreferencesService } from './preferences.service.js';

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
