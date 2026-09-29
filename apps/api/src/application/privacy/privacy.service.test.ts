import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consentEventRepository } from '@chefer/database';
import { privacyService } from './privacy.service.js';

// ─── privacy.recordAnalyticsConsent / getConsentHistory / acceptTerms ───────
// UX-39 AC3: grant + revoke AI produces two history rows; "100% logged"
// applies to every consent writer, including these three.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    consentEventRepository: {
      record: vi.fn((data: unknown) => Promise.resolve({ id: 'e', ...(data as object) })),
      findAllByUser: vi.fn(),
      findLatestByKind: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PrivacyService.recordAnalyticsConsent', () => {
  it('logs only the switches that changed', async () => {
    const events = await privacyService.recordAnalyticsConsent({
      userId: 'u1',
      source: 'mobile',
      anonymous: true,
    });

    expect(consentEventRepository.record).toHaveBeenCalledTimes(1);
    expect(consentEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', kind: 'ANALYTICS_ANON', granted: true }),
    );
    expect(events).toHaveLength(1);
  });

  it('logs both switches when both are given, each as its own row', async () => {
    const events = await privacyService.recordAnalyticsConsent({
      userId: 'u1',
      source: 'web',
      anonymous: true,
      linked: false,
    });

    expect(consentEventRepository.record).toHaveBeenCalledTimes(2);
    expect(consentEventRepository.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'ANALYTICS_ANON', granted: true }),
    );
    expect(consentEventRepository.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'ANALYTICS_LINKED', granted: false }),
    );
    expect(events).toHaveLength(2);
  });
});

describe('PrivacyService.acceptTerms', () => {
  it('logs TERMS and PRIVACY with the document version', async () => {
    const events = await privacyService.acceptTerms({
      userId: 'u1',
      source: 'web',
      documentVersion: 'v3',
    });

    expect(consentEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'TERMS', granted: true, documentVersion: 'v3' }),
    );
    expect(consentEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'PRIVACY', granted: true, documentVersion: 'v3' }),
    );
    expect(events).toHaveLength(2);
  });

  it('also logs AGE when ageConfirmed is set', async () => {
    const events = await privacyService.acceptTerms({
      userId: 'u1',
      source: 'mobile',
      documentVersion: 'v3',
      ageConfirmed: true,
    });

    expect(consentEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'AGE', granted: true }),
    );
    expect(events).toHaveLength(3);
  });
});

describe('PrivacyService.getConsentHistory', () => {
  it('reads the full log, newest first, through the repository', async () => {
    vi.mocked(consentEventRepository.findAllByUser).mockResolvedValue([
      { id: 'e2' },
      { id: 'e1' },
    ] as never);

    const result = await privacyService.getConsentHistory('u1');

    expect(consentEventRepository.findAllByUser).toHaveBeenCalledWith('u1');
    expect(result).toEqual([{ id: 'e2' }, { id: 'e1' }]);
  });
});
