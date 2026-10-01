import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userRepository } from '@chefer/database';
import { AI_CONSENT_REQUIRED_MESSAGE, type UserProfile } from '@chefer/types';
import { importRouter } from './import.router.js';
import { mealPlanRouter } from './meal-plan.router.js';
import { shoppingListRouter } from './shopping-list.router.js';

// R-10 — the AI-consent gate on real procedures. `mealPlan.swapRecipe` only
// needs consent for a premium user (free swaps are curated), `shoppingList.
// regenerate` checks the tier FIRST, and the import previews always need it.
// Services are mocked; the mode comes from a mocked env.

const enforce = vi.hoisted(() => ({ mode: 'on' }));
vi.mock('../lib/env.js', () => ({
  env: new Proxy(
    {},
    {
      get: (_target, key) => (key === 'AI_CONSENT_ENFORCE' ? enforce.mode : undefined),
    },
  ),
}));
vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, userRepository: { findAiDataConsentAt: vi.fn() } };
});
const imports = vi.hoisted(() => ({
  preview: vi.fn().mockResolvedValue({ ok: true }),
  previewVideo: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../application/recipe-import/recipe-import.service.js', () => ({
  recipeImportService: imports,
}));
const shopping = vi.hoisted(() => ({ regenerate: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('../application/shopping-list/shopping-list.service.js', () => ({
  shoppingListService: shopping,
}));
const plan = vi.hoisted(() => ({ swapRecipe: vi.fn().mockResolvedValue({ id: 'r1' }) }));
vi.mock('../application/meal-plan/meal-plan.service.js', () => ({ mealPlanService: plan }));
vi.mock('../application/meal-plan/plan-shape.service.js', () => ({ planShapeService: {} }));
const quotas = vi.hoisted(() => ({
  reserveAiSwap: vi.fn().mockResolvedValue({ release: vi.fn() }),
  reservePlanGeneration: vi.fn().mockResolvedValue({ release: vi.fn() }),
}));
vi.mock('../lib/quotas.js', () => quotas);
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const baseUser: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'PREMIUM',
  image: null,
};
const ctx = (user: UserProfile = baseUser) => ({
  user,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel: 4,
  res: {} as Response,
});
const free: UserProfile = { ...baseUser, planTier: 'FREE' };
const consentRequired = { code: 'FORBIDDEN', message: AI_CONSENT_REQUIRED_MESSAGE };
const swapInput = { planId: 'p1', dayOfWeek: 0, mealType: 'dinner' as const };
const urlInput = { url: 'https://example.com/recipe' };

beforeEach(() => {
  vi.clearAllMocks();
  enforce.mode = 'on';
  vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
});

describe('recipe.importPreview / importVideoPreview', () => {
  it('reject AI_CONSENT_REQUIRED without consent, before the service runs', async () => {
    const caller = importRouter.createCaller(ctx());
    await expect(caller.importPreview(urlInput)).rejects.toMatchObject(consentRequired);
    await expect(
      caller.importVideoPreview({ url: 'https://www.youtube.com/watch?v=abc' }),
    ).rejects.toMatchObject(consentRequired);
    expect(imports.preview).not.toHaveBeenCalled();
    expect(imports.previewVideo).not.toHaveBeenCalled();
  });

  it('run for a consented user', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(new Date());
    await expect(importRouter.createCaller(ctx()).importPreview(urlInput)).resolves.toBeDefined();
    expect(imports.preview).toHaveBeenCalledTimes(1);
  });

  it('run without consent when AI_CONSENT_ENFORCE=off', async () => {
    enforce.mode = 'off';
    await expect(importRouter.createCaller(ctx()).importPreview(urlInput)).resolves.toBeDefined();
    expect(userRepository.findAiDataConsentAt).not.toHaveBeenCalled();
  });
});

describe('mealPlan.swapRecipe', () => {
  it('premium without consent: rejected before the quota is reserved', async () => {
    await expect(mealPlanRouter.createCaller(ctx()).swapRecipe(swapInput)).rejects.toMatchObject(
      consentRequired,
    );
    expect(quotas.reserveAiSwap).not.toHaveBeenCalled();
    expect(plan.swapRecipe).not.toHaveBeenCalled();
  });

  it('premium with consent: swaps', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(new Date());
    await expect(mealPlanRouter.createCaller(ctx()).swapRecipe(swapInput)).resolves.toBeDefined();
  });

  it('free (curated swap, no AI): never needs consent', async () => {
    await expect(
      mealPlanRouter.createCaller(ctx(free)).swapRecipe(swapInput),
    ).resolves.toBeDefined();
    expect(userRepository.findAiDataConsentAt).not.toHaveBeenCalled();
  });
});

describe('shoppingList.regenerate', () => {
  it('free users still get the upgrade message, not the consent one', async () => {
    await expect(
      shoppingListRouter.createCaller(ctx(free)).regenerate({ weekOffset: 0 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringContaining('premium') });
  });

  it('premium without consent is rejected; with consent it runs', async () => {
    const caller = shoppingListRouter.createCaller(ctx());
    await expect(caller.regenerate({ weekOffset: 0 })).rejects.toMatchObject(consentRequired);
    expect(shopping.regenerate).not.toHaveBeenCalled();
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(new Date());
    await expect(caller.regenerate({ weekOffset: 0 })).resolves.toBeDefined();
  });
});

describe('the wire format', () => {
  it('exposes data.reason = AI_CONSENT_REQUIRED through the errorFormatter (additive; null otherwise)', async () => {
    const { errorFormatter } = importRouter._def._config;
    const { aiConsentRequiredError } = await import('../lib/ai-consent-gate.js');
    const { TRPCError } = await import('@trpc/server');
    const format = (error: InstanceType<typeof TRPCError>) =>
      errorFormatter({
        error,
        type: 'mutation',
        path: 'recipe.importPreview',
        input: undefined,
        ctx: undefined,
        shape: {
          message: error.message,
          code: -32003,
          data: { code: error.code, httpStatus: 403, path: 'recipe.importPreview' },
        },
      }) as { data: { reason: unknown } };

    expect(format(aiConsentRequiredError()).data.reason).toBe('AI_CONSENT_REQUIRED');
    expect(format(new TRPCError({ code: 'FORBIDDEN' })).data.reason).toBeNull();
  });
});
