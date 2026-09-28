import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { TargetsService } from './targets.service.js';

// ─── Module mocks (hoisted) ─────────────────────────────────────────────────

const { chefProfileRepository, targetChangeRepository, chefReviewRepository } = vi.hoisted(() => ({
  chefProfileRepository: {
    findByUserId: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  targetChangeRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findUnresolvedByUser: vi.fn(),
    resolve: vi.fn(),
    findAllByUser: vi.fn().mockResolvedValue([]),
  },
  chefReviewRepository: {
    findByUserAndWeek: vi.fn(),
    findLatest: vi.fn(),
    findPreviousBefore: vi.fn(),
    upsert: vi.fn(),
    resolveProposal: vi.fn(),
  },
}));

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, chefProfileRepository, targetChangeRepository, chefReviewRepository };
});

vi.mock('../training-nutrition/training-nutrition.service.js', () => ({
  trainingNutritionService: {
    loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: null }),
  },
}));

let flagsEnabled: Record<string, boolean> = {};
vi.mock('../../lib/flags.js', () => ({
  isFlagEnabled: (key: string) => flagsEnabled[key] === true,
}));

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BASE_PROFILE = {
  id: 'cp1',
  userId: 'u1',
  goal: 'LOSE_WEIGHT',
  biologicalSex: 'MALE',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'MODERATELY_ACTIVE',
  dailyCalorieTarget: null,
  targetAdjustmentKcal: 0,
  targetMode: 'SUGGESTED',
  customKcal: null,
  customProteinG: null,
  customCarbsG: null,
  customFatG: null,
  customTrainingKcal: null,
  customTrainingProteinG: null,
  addTrainingBonus: true,
  targetSnapshot: null,
};

const FREE_USER: UserProfile = {
  id: 'u1',
  email: 'targets-test@chefer.dev',
  name: 'Targets Test',
  firstName: 'Targets',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const PREMIUM_USER: UserProfile = { ...FREE_USER, planTier: 'PREMIUM' };

beforeEach(() => {
  vi.clearAllMocks();
  flagsEnabled = { ownTargetsFree: true };
  chefProfileRepository.findByUserId.mockResolvedValue(BASE_PROFILE);
  chefProfileRepository.upsert.mockImplementation((_userId: string, data: object) =>
    Promise.resolve({ ...BASE_PROFILE, ...data }),
  );
  targetChangeRepository.findAllByUser.mockResolvedValue([]);
});

// ─── get() / detection (§2.11, T-11.1) ──────────────────────────────────────

describe('TargetsService.get — change detection', () => {
  it('the first read writes a baseline snapshot with no notice', async () => {
    const service = new TargetsService();
    await service.get('u1');

    expect(targetChangeRepository.create).not.toHaveBeenCalled();
    expect(chefProfileRepository.upsert).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ targetSnapshot: expect.any(Object) }),
    );
  });

  it('a second read with nothing changed writes no new notice', async () => {
    const service = new TargetsService();
    const first = await service.get('u1');
    chefProfileRepository.findByUserId.mockResolvedValue({
      ...BASE_PROFILE,
      targetSnapshot: {
        effective: first.effective,
        suggested: first.suggested,
        inputs: first.inputs,
      },
    });

    await service.get('u1');

    expect(targetChangeRepository.create).not.toHaveBeenCalled();
  });

  it('a weight change for a SUGGESTED user writes a CHANGED row with reason WEIGHT (AC1)', async () => {
    const service = new TargetsService();
    const first = await service.get('u1');
    chefProfileRepository.findByUserId.mockResolvedValue({
      ...BASE_PROFILE,
      weightKg: 90, // was 80
      targetSnapshot: {
        effective: first.effective,
        suggested: first.suggested,
        inputs: first.inputs,
      },
    });

    await service.get('u1');

    expect(targetChangeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', kind: 'CHANGED', reason: 'WEIGHT' }),
    );
  });

  it('debounces a second weight-driven notice within 7 days (risk mitigation)', async () => {
    const service = new TargetsService();
    const first = await service.get('u1');
    targetChangeRepository.findAllByUser.mockResolvedValue([
      { reason: 'WEIGHT', createdAt: new Date() },
    ]);
    chefProfileRepository.findByUserId.mockResolvedValue({
      ...BASE_PROFILE,
      weightKg: 95,
      targetSnapshot: {
        effective: first.effective,
        suggested: first.suggested,
        inputs: first.inputs,
      },
    });

    await service.get('u1');

    expect(targetChangeRepository.create).not.toHaveBeenCalled();
  });

  it('an OWN user never gets their effective target moved by a weight change (AC2)', async () => {
    const owned = {
      ...BASE_PROFILE,
      targetMode: 'OWN',
      customKcal: 2200,
      customProteinG: 180,
      customCarbsG: 200,
      customFatG: 70,
    };
    chefProfileRepository.findByUserId.mockResolvedValue(owned);
    const service = new TargetsService();
    const first = await service.get('u1');
    expect(first.effective.dailyCalorieTarget).toBe(2200);

    chefProfileRepository.findByUserId.mockResolvedValue({
      ...owned,
      weightKg: 95,
      targetSnapshot: {
        effective: first.effective,
        suggested: first.suggested,
        inputs: first.inputs,
      },
    });
    const second = await service.get('u1');

    expect(second.effective.dailyCalorieTarget).toBe(2200); // unchanged
  });

  it('an OWN user gets a SUGGESTED (informational) notice when the suggested numbers drift >= 5%', async () => {
    const owned = {
      ...BASE_PROFILE,
      targetMode: 'OWN',
      customKcal: 2200,
      customProteinG: 180,
      customCarbsG: 200,
      customFatG: 70,
    };
    chefProfileRepository.findByUserId.mockResolvedValue(owned);
    const service = new TargetsService();
    const first = await service.get('u1');

    chefProfileRepository.findByUserId.mockResolvedValue({
      ...owned,
      weightKg: 150, // big enough swing to move `suggested` >= 5%
      targetSnapshot: {
        effective: first.effective,
        suggested: first.suggested,
        inputs: first.inputs,
      },
    });
    await service.get('u1');

    expect(targetChangeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'SUGGESTED' }),
    );
  });
});

// ─── set() — validation (T-35.1 AC4) and the flag/premium gate ─────────────

describe('TargetsService.set', () => {
  it('requires premium when ownTargetsFree is off', async () => {
    flagsEnabled = {};
    const service = new TargetsService();
    await expect(
      service.set('u1', FREE_USER, { targetMode: 'OWN', kcal: 2000, proteinG: 150 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a free user succeeds when ownTargetsFree is on (D-2 default)', async () => {
    const service = new TargetsService();
    await expect(
      service.set('u1', FREE_USER, { targetMode: 'OWN', kcal: 2000, proteinG: 150 }),
    ).resolves.toBeTruthy();
  });

  it('a premium user succeeds even with the flag off', async () => {
    flagsEnabled = {};
    const service = new TargetsService();
    await expect(
      service.set('u1', PREMIUM_USER, { targetMode: 'OWN', kcal: 2000, proteinG: 150 }),
    ).resolves.toBeTruthy();
  });

  it('rejects calories below the floor', async () => {
    const service = new TargetsService();
    await expect(
      service.set('u1', PREMIUM_USER, { targetMode: 'OWN', kcal: 1000, proteinG: 150 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects protein outside 40-400g', async () => {
    const service = new TargetsService();
    await expect(
      service.set('u1', PREMIUM_USER, { targetMode: 'OWN', kcal: 2000, proteinG: 20 }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('rejects macros that do not fit the stated calories within 10% (4/4/9 rule)', async () => {
    const service = new TargetsService();
    // 150p*4 + 50c*4 + 20f*9 = 980, vs 2000 stated — way outside 10%.
    await expect(
      service.set('u1', PREMIUM_USER, {
        targetMode: 'OWN',
        kcal: 2000,
        proteinG: 150,
        carbsG: 50,
        fatG: 20,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts macros that fit within 10%', async () => {
    const service = new TargetsService();
    // 150p*4 + 200c*4 + 55f*9 = 1895, vs 2000 -> within 10%.
    await expect(
      service.set('u1', PREMIUM_USER, {
        targetMode: 'OWN',
        kcal: 2000,
        proteinG: 150,
        carbsG: 200,
        fatG: 55,
      }),
    ).resolves.toBeTruthy();
  });

  it('stores the override and keeps the legacy dailyCalorieTarget in step', async () => {
    const service = new TargetsService();
    await service.set('u1', PREMIUM_USER, { targetMode: 'OWN', kcal: 2200, proteinG: 170 });

    expect(chefProfileRepository.upsert).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        targetMode: 'OWN',
        customKcal: 2200,
        customProteinG: 170,
        dailyCalorieTarget: 2200,
      }),
    );
  });

  it('switching back to SUGGESTED clears the override mode without a notice', async () => {
    const service = new TargetsService();
    await service.set('u1', PREMIUM_USER, { targetMode: 'SUGGESTED' });

    expect(chefProfileRepository.upsert).toHaveBeenCalledWith('u1', { targetMode: 'SUGGESTED' });
    expect(targetChangeRepository.create).not.toHaveBeenCalled();
  });
});

// ─── acknowledgeChange (§2.11, T-11.1) ──────────────────────────────────────

describe('TargetsService.acknowledgeChange', () => {
  it('404s a change belonging to another user', async () => {
    targetChangeRepository.findById.mockResolvedValue({ id: 'c1', userId: 'someone-else' });
    const service = new TargetsService();
    await expect(service.acknowledgeChange('u1', { id: 'c1', keep: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('is idempotent on an already-resolved change', async () => {
    targetChangeRepository.findById.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      resolvedAt: new Date(),
    });
    const service = new TargetsService();
    await expect(service.acknowledgeChange('u1', { id: 'c1', keep: true })).resolves.toEqual({
      resolved: true,
    });
    expect(targetChangeRepository.resolve).not.toHaveBeenCalled();
  });

  it('CHANGED + keep:true restores the pre-change numbers as an OWN override ("Keep")', async () => {
    targetChangeRepository.findById.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      kind: 'CHANGED',
      reason: 'GYM_SETUP',
      resolvedAt: null,
      fields: [
        { field: 'dailyCalorieTarget', before: 2100, after: 2400 },
        { field: 'proteinG', before: 160, after: 190 },
      ],
    });
    const service = new TargetsService();
    await service.acknowledgeChange('u1', { id: 'c1', keep: true });

    expect(chefProfileRepository.upsert).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ targetMode: 'OWN', customKcal: 2100, customProteinG: 160 }),
    );
    expect(targetChangeRepository.resolve).toHaveBeenCalledWith('c1', 'KEEP_OLD');
  });

  it('CHANGED + keep:false just resolves the row (the new value already applied)', async () => {
    targetChangeRepository.findById.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      kind: 'CHANGED',
      reason: 'WEIGHT',
      resolvedAt: null,
      fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2400 }],
    });
    const service = new TargetsService();
    await service.acknowledgeChange('u1', { id: 'c1', keep: false });

    expect(targetChangeRepository.resolve).toHaveBeenCalledWith('c1', 'USE_NEW');
    // No OWN override written — the suggested value stands.
    expect(chefProfileRepository.upsert).not.toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ targetMode: 'OWN' }),
    );
  });

  it('a coach SUGGESTED proposal + keep:false applies it to the cumulative dial (T-35.4)', async () => {
    targetChangeRepository.findById.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      kind: 'SUGGESTED',
      reason: 'COACH',
      resolvedAt: null,
      fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2000 }],
    });
    chefReviewRepository.findLatest.mockResolvedValue({
      id: 'r1',
      proposedAdjustmentKcal: -100,
      proposalResolvedAt: null,
    });
    const service = new TargetsService();
    await service.acknowledgeChange('u1', { id: 'c1', keep: false });

    expect(chefProfileRepository.upsert).toHaveBeenCalledWith('u1', { targetAdjustmentKcal: -100 });
    expect(chefReviewRepository.resolveProposal).toHaveBeenCalledWith('r1');
    expect(targetChangeRepository.resolve).toHaveBeenCalledWith('c1', 'USE_NEW');
  });

  it('a coach SUGGESTED proposal + keep:true declines it — the dial never moves', async () => {
    targetChangeRepository.findById.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      kind: 'SUGGESTED',
      reason: 'COACH',
      resolvedAt: null,
      fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2000 }],
    });
    const service = new TargetsService();
    await service.acknowledgeChange('u1', { id: 'c1', keep: true });

    expect(chefReviewRepository.resolveProposal).not.toHaveBeenCalled();
    expect(targetChangeRepository.resolve).toHaveBeenCalledWith('c1', 'KEEP_OLD');
  });
});

// ─── proposeCoachAdjustment ─────────────────────────────────────────────────

describe('TargetsService.proposeCoachAdjustment', () => {
  it('writes a SUGGESTED/COACH row when the proposal is non-zero', async () => {
    const service = new TargetsService();
    await service.proposeCoachAdjustment('u1', 2100, -100);

    expect(targetChangeRepository.create).toHaveBeenCalledWith({
      userId: 'u1',
      kind: 'SUGGESTED',
      reason: 'COACH',
      fields: [{ field: 'dailyCalorieTarget', before: 2100, after: 2000 }],
    });
  });

  it('writes nothing when the proposal is zero', async () => {
    const service = new TargetsService();
    await service.proposeCoachAdjustment('u1', 2100, 0);
    expect(targetChangeRepository.create).not.toHaveBeenCalled();
  });
});
