import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consentEventRepository, userRepository } from '@chefer/database';
import { consentBackfillService } from './consent-backfill.service.js';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    userRepository: {
      findMany: vi.fn(),
    },
    consentEventRepository: {
      existsForUserKindSource: vi.fn(),
      record: vi.fn(),
    },
  };
});

const AI_CONSENT_AT = new Date('2026-03-14T09:30:00.000Z');
const USER = { id: 'u1', aiDataConsentAt: AI_CONSENT_AT };

describe('ConsentBackfillService.backfillAiConsentEvents (§2.13, T-39.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backfills a migration event whose createdAt is the ORIGINAL aiDataConsentAt, not now', async () => {
    vi.mocked(userRepository.findMany)
      .mockResolvedValueOnce([USER] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(consentEventRepository.existsForUserKindSource).mockResolvedValue(false);
    vi.mocked(consentEventRepository.record).mockResolvedValue({} as never);

    const result = await consentBackfillService.backfillAiConsentEvents();

    expect(result).toEqual({ users: 1, skipped: 0 });
    expect(consentEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        kind: 'AI',
        granted: true,
        source: 'migration',
        createdAt: AI_CONSENT_AT,
      }),
    );
  });

  it('a second run records nothing (idempotent)', async () => {
    vi.mocked(userRepository.findMany)
      .mockResolvedValueOnce([USER] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(consentEventRepository.existsForUserKindSource).mockResolvedValue(true);

    const result = await consentBackfillService.backfillAiConsentEvents();

    expect(result).toEqual({ users: 0, skipped: 1 });
    expect(consentEventRepository.record).not.toHaveBeenCalled();
  });
});
