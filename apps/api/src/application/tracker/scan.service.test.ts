import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { aiService } from '../../lib/ai/index.js';
import { assertMealScanQuota } from '../../lib/quotas.js';
import { ScanService } from './scan.service.js';

// ─── Friendly AI-failure mapping in the scan path (§4.5.2) ───────────────────
// The quota gate and the vision call are both stubbed; these tests pin how
// upstream AI failures surface — one calm sentence, never the provider blob.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: { aiCallLog: { create: vi.fn().mockResolvedValue({}) } },
  };
});

vi.mock('../../lib/ai/index.js', () => ({
  aiService: { analyzeMealPhoto: vi.fn() },
}));

vi.mock('../../lib/quotas.js', () => ({
  assertMealScanQuota: vi.fn().mockResolvedValue(undefined),
}));

const premiumUser: UserProfile = {
  id: 'user-prem',
  email: 'prem@test.dev',
  name: 'Prem',
  firstName: 'Prem',
  role: 'USER',
  planTier: 'PREMIUM',
  image: null,
};

const estimate = {
  dishName: 'Grilled chicken with rice and vegetables',
  confidence: 'med' as const,
  kcal: 520,
  protein: 38,
  carbs: 55,
  fat: 14,
  portionNote: 'assuming a standard 350 g plate',
};

const analyzeMock = vi.mocked(aiService.analyzeMealPhoto);

// NOTE: restore only this spy — vi.restoreAllMocks() would wipe the
// module-mock implementations (prisma.aiCallLog.create) between tests.
const spyOnConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);
let consoleSpy: ReturnType<typeof spyOnConsoleError>;
beforeEach(() => {
  consoleSpy = spyOnConsoleError();
  analyzeMock.mockReset();
  vi.mocked(assertMealScanQuota).mockResolvedValue(undefined);
});
afterEach(() => {
  consoleSpy.mockRestore();
});

describe('ScanService.analyzeMealPhoto', () => {
  it('passes a successful estimate through unchanged', async () => {
    analyzeMock.mockResolvedValue(estimate);
    const result = await new ScanService().analyzeMealPhoto(premiumUser, 'AAAA', 'image/jpeg');
    expect(result).toEqual(estimate);
  });

  it('maps an upstream 429 to the friendly over-capacity error, raw blob stays in the log', async () => {
    const gemini429 = Object.assign(
      new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'),
      { status: 429 },
    );
    analyzeMock.mockRejectedValue(gemini429);
    await expect(
      new ScanService().analyzeMealPhoto(premiumUser, 'AAAA', 'image/jpeg'),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: expect.stringMatching(/over capacity/) as string,
    });
    expect(console.error).toHaveBeenCalledWith('[AI] analyzeMealPhoto failed:', gemini429);
  });

  it('maps other AI failures to the friendly photo fallback', async () => {
    analyzeMock.mockRejectedValue(new Error('response failed validation'));
    await expect(
      new ScanService().analyzeMealPhoto(premiumUser, 'AAAA', 'image/jpeg'),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: "The chef couldn't read that photo. Try again with a clearer shot.",
    });
  });

  it('lets the quota gate errors through untouched', async () => {
    const { TRPCError } = await import('@trpc/server');
    vi.mocked(assertMealScanQuota).mockRejectedValue(
      new TRPCError({ code: 'FORBIDDEN', message: 'Premium feature.' }),
    );
    await expect(
      new ScanService().analyzeMealPhoto(premiumUser, 'AAAA', 'image/jpeg'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Premium feature.' });
    expect(analyzeMock).not.toHaveBeenCalled();
  });
});
