import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userRepository } from '@chefer/database';
import { HEALTH_CONSENT_API_LEVEL } from '@chefer/types';
import {
  assertHealthConsent,
  healthConsentEnforced,
  writesBodyMetrics,
  writesSafetyTerms,
} from './health-consent.js';

// T-26.3 — the whole rollout policy. Installed binaries (no header = level 0,
// or any level below the one that shows the consent sheet) must NEVER be
// rejected under `declared`.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, userRepository: { findHealthConsentAt: vi.fn() } };
});

const NEW = HEALTH_CONSENT_API_LEVEL;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('healthConsentEnforced', () => {
  it('off: nobody is enforced, whatever the level', () => {
    for (const level of [0, 1, 3, NEW, 99]) {
      expect(healthConsentEnforced('off', level)).toBe(false);
    }
  });

  it('declared: only clients at or above the consent level', () => {
    expect(healthConsentEnforced('declared', 0)).toBe(false); // installed binary, no header
    expect(healthConsentEnforced('declared', 3)).toBe(false); // OTA that predates the sheet
    expect(healthConsentEnforced('declared', NEW - 1)).toBe(false);
    expect(healthConsentEnforced('declared', NEW)).toBe(true);
    expect(healthConsentEnforced('declared', NEW + 1)).toBe(true);
  });

  it('all: every client, including level 0', () => {
    expect(healthConsentEnforced('all', 0)).toBe(true);
    expect(healthConsentEnforced('all', NEW)).toBe(true);
  });
});

describe('assertHealthConsent', () => {
  it('under off it never reads the database and never rejects', async () => {
    await expect(
      assertHealthConsent({ userId: 'u1', clientApiLevel: NEW, mode: 'off' }),
    ).resolves.toBeUndefined();
    expect(userRepository.findHealthConsentAt).not.toHaveBeenCalled();
  });

  it('under declared, an un-consented new client is rejected with HEALTH_CONSENT_REQUIRED', async () => {
    vi.mocked(userRepository.findHealthConsentAt).mockResolvedValue(null);
    await expect(
      assertHealthConsent({ userId: 'u1', clientApiLevel: NEW, mode: 'declared' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'HEALTH_CONSENT_REQUIRED' });
  });

  it('under declared, a request WITHOUT the header (installed binary) is accepted', async () => {
    vi.mocked(userRepository.findHealthConsentAt).mockResolvedValue(null);
    await expect(
      assertHealthConsent({ userId: 'u1', clientApiLevel: 0, mode: 'declared' }),
    ).resolves.toBeUndefined();
    expect(userRepository.findHealthConsentAt).not.toHaveBeenCalled();
  });

  it('a consented user is accepted in every mode', async () => {
    vi.mocked(userRepository.findHealthConsentAt).mockResolvedValue(new Date());
    for (const mode of ['off', 'declared', 'all'] as const) {
      await expect(
        assertHealthConsent({ userId: 'u1', clientApiLevel: NEW, mode }),
      ).resolves.toBeUndefined();
    }
  });

  it('under all, an un-consented level-0 client is rejected', async () => {
    vi.mocked(userRepository.findHealthConsentAt).mockResolvedValue(null);
    await expect(
      assertHealthConsent({ userId: 'u1', clientApiLevel: 0, mode: 'all' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('input predicates', () => {
  it('writesSafetyTerms: only non-empty lists count (clearing needs no consent)', () => {
    expect(
      writesSafetyTerms({ allergies: [], dietaryRestrictions: [], dislikedIngredients: [] }),
    ).toBe(false);
    expect(writesSafetyTerms({ name: 'Mia', portionFactor: 0.5 })).toBe(false);
    expect(writesSafetyTerms({ allergies: ['Peanuts'] })).toBe(true);
    expect(writesSafetyTerms({ dislikedIngredients: ['Fish'] })).toBe(true);
    expect(writesSafetyTerms(undefined)).toBe(false);
  });

  it('writesBodyMetrics: any goal/body field counts, other targets fields do not', () => {
    expect(writesBodyMetrics({ goal: 'LOSE_WEIGHT' })).toBe(true);
    expect(writesBodyMetrics({ weightKg: 70 })).toBe(true);
    expect(writesBodyMetrics({ mealsPerDay: 3, preferredUnits: 'METRIC' })).toBe(false);
    expect(writesBodyMetrics({ goal: undefined })).toBe(false);
  });
});
