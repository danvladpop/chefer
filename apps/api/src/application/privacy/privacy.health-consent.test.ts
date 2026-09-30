import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_CONSENT_VERSION } from '@chefer/types';
import { privacyService } from './privacy.service.js';

// T-26.1 / UX-26 AC3 — grant and withdraw-and-delete. The repositories return
// un-awaited "operations" that run inside ONE prisma.$transaction; these tests
// pin which operations are in it.

const db = vi.hoisted(() => {
  const op = (name: string) => vi.fn((...args: unknown[]) => ({ name, args }));
  return {
    transaction: vi.fn().mockResolvedValue([]),
    findHealthConsentAt: vi.fn(),
    setHealthConsent: op('user.setHealthConsent'),
    dietaryClear: op('dietary.clear'),
    householdClear: op('household.clear'),
    chefClear: op('chef.clear'),
    weightClear: op('weight.clear'),
    targetChangeDelete: op('targetChange.deleteMany'),
    safetyReportUpdate: op('safetyReport.updateMany'),
    consentCreate: op('consentEvent.create'),
  };
});

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      $transaction: db.transaction,
      targetChange: { deleteMany: db.targetChangeDelete },
      safetyReport: { updateMany: db.safetyReportUpdate },
      consentEvent: { create: db.consentCreate },
    },
    userRepository: {
      findHealthConsentAt: db.findHealthConsentAt,
      setHealthConsent: db.setHealthConsent,
    },
    dietaryPreferencesRepository: { clearHealthData: db.dietaryClear },
    householdMemberRepository: { clearHealthData: db.householdClear },
    chefProfileRepository: { clearHealthData: db.chefClear },
    weightEntryRepository: { deleteAllForUser: db.weightClear },
    consentEventRepository: { record: vi.fn() },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PrivacyService.grantHealthConsent', () => {
  it('writes the HEALTH event and the cache column in one transaction', async () => {
    db.findHealthConsentAt.mockResolvedValue(null);
    const result = await privacyService.grantHealthConsent({ userId: 'u1', source: 'mobile' });

    expect(result.healthDataConsentAt).toBeInstanceOf(Date);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.setHealthConsent).toHaveBeenCalledWith(
      'u1',
      result.healthDataConsentAt,
      HEALTH_CONSENT_VERSION,
    );
    expect(db.consentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        kind: 'HEALTH',
        granted: true,
        source: 'mobile',
        documentVersion: HEALTH_CONSENT_VERSION,
      }),
    });
  });

  it('is idempotent: a second grant keeps the original timestamp and logs nothing', async () => {
    const original = new Date('2026-10-01T10:00:00Z');
    db.findHealthConsentAt.mockResolvedValue(original);
    const result = await privacyService.grantHealthConsent({ userId: 'u1', source: 'web' });

    expect(result.healthDataConsentAt).toBe(original);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.consentCreate).not.toHaveBeenCalled();
  });
});

describe('PrivacyService.withdrawHealthData', () => {
  it('deletes every listed health table for the user and records the withdrawal, atomically', async () => {
    await privacyService.withdrawHealthData({ userId: 'u1', source: 'web' });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    const ops = (db.transaction.mock.calls[0]?.[0] as { name: string }[]).map((o) => o.name);
    expect(ops).toEqual([
      'dietary.clear', // owner allergies / diets / dislikes
      'household.clear', // every member's allergies / diets / dislikes
      'chef.clear', // goal, body metrics, own targets
      'weight.clear', // every weigh-in
      'targetChange.deleteMany', // before/after copies of goal and targets
      'safetyReport.updateMany', // allergy snapshot inside report rows
      'user.setHealthConsent', // cache cleared
      'consentEvent.create', // the withdrawal is recorded
    ]);
    for (const clear of [db.dietaryClear, db.householdClear, db.chefClear, db.weightClear]) {
      expect(clear).toHaveBeenCalledWith('u1');
    }
    expect(db.setHealthConsent).toHaveBeenCalledWith('u1', null, null);
    expect(db.safetyReportUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { rulesSnapshot: {} },
    });
    expect(db.consentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        kind: 'HEALTH',
        granted: false,
        source: 'web',
      }),
    });
  });

  it('runs even when no consent record exists (data stored before consent existed, Q-7)', async () => {
    db.findHealthConsentAt.mockResolvedValue(null);
    await privacyService.withdrawHealthData({ userId: 'u1', source: 'mobile' });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
