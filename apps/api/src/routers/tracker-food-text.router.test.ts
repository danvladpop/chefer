import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userRepository } from '@chefer/database';
import { AI_CONSENT_REQUIRED_MESSAGE, type UserProfile } from '@chefer/types';
import { trackerRouter } from './tracker.router.js';

// Lane A4: parsing a typed sentence sends it to the AI provider — AI consent
// first (R-10); logging the reviewed items is plain and free.

vi.mock('../lib/env.js', () => ({
  env: new Proxy({}, { get: (_t, key) => (key === 'AI_CONSENT_ENFORCE' ? 'on' : undefined) }),
}));
vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  userRepository: { findAiDataConsentAt: vi.fn() },
}));
const foodText = vi.hoisted(() => ({ parse: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('../application/food-text/food-text.service.js', () => ({ foodTextService: foodText }));
const tracker = vi.hoisted(() => ({ logItems: vi.fn().mockResolvedValue({ entryIds: [] }) }));
vi.mock('../application/tracker/tracker.service.js', () => ({ trackerService: tracker }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const user: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const caller = () =>
  trackerRouter.createCaller({
    user,
    requestId: 't',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient: true,
    clientApiLevel: 6,
    res: {} as Response,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
});

describe('tracker.parseFoodText / logItems (lane A4)', () => {
  it('parseFoodText without AI consent is refused before any AI or quota work', async () => {
    await expect(caller().parseFoodText({ text: '2 eggs and toast' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: AI_CONSENT_REQUIRED_MESSAGE,
    });
    expect(foodText.parse).not.toHaveBeenCalled();
  });

  it('with consent it parses; an over-long sentence is refused', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(new Date());
    await caller().parseFoodText({ text: ' 2 eggs and toast ' });
    expect(foodText.parse).toHaveBeenCalledWith(user, '2 eggs and toast');
    await expect(caller().parseFoodText({ text: 'x'.repeat(301) })).rejects.toBeDefined();
  });

  it('logItems needs no AI consent', async () => {
    await caller().logItems({
      date: '2026-10-22',
      mealType: 'lunch',
      items: [
        { name: 'Egg, 100 g', estimatedBy: 'manual', kcal: 143, protein: 13, carbs: 1, fat: 10 },
      ],
    });
    expect(tracker.logItems).toHaveBeenCalledTimes(1);
    expect(userRepository.findAiDataConsentAt).not.toHaveBeenCalled();
  });
});
