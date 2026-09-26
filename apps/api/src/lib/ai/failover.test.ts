import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChainAIService, FailoverAIService, type ShadowHook } from './failover.js';
import { DEFAULT_AI_ROUTES, resolveRoutes, type AiWorkload } from './routing.js';
import type { IAIService, MealPlanInput } from './types.js';

// ─── Failover wrapper (premium_plan.md §5.5 W3-A) ────────────────────────────
// Fixture errors only — no live calls (§8 AI-cost rule).

/** Free-tier quota exhaustion, the error that motivated the failover. */
const capacity429 = Object.assign(
  new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'),
  { status: 429 },
);

/** A validation failure — must NOT trigger failover. */
const validationError = new Error('meal plan response failed validation — days required');

const PLAN_INPUT = { userId: 'u1' } as MealPlanInput;

/** Builds a stub IAIService whose every method is a vi.fn. */
function stubService(overrides: Partial<Record<keyof IAIService, unknown>> = {}): IAIService {
  const base: Record<keyof IAIService, unknown> = {
    generateMealPlan: vi.fn().mockResolvedValue({ days: [] }),
    generateRecipeSwap: vi.fn().mockResolvedValue({ id: 'r1' }),
    generateShoppingList: vi.fn().mockResolvedValue({ items: [] }),
    estimateIngredientPrices: vi.fn().mockResolvedValue([]),
    chat: vi.fn().mockResolvedValue(new ReadableStream()),
    analyzeMealPhoto: vi.fn().mockResolvedValue({ dishName: 'Pasta' }),
    extractRecipe: vi.fn().mockResolvedValue({ name: 'Extracted' }),
    extractRecipeAnnotated: vi
      .fn()
      .mockResolvedValue({ recipe: { name: 'Extracted' }, confidence: 'high', assumptions: [] }),
    cheferizeRecipe: vi.fn().mockResolvedValue({ adapted: { name: 'A' }, changes: [] }),
    generateReviewText: vi.fn().mockResolvedValue('Great week.'),
  };
  return { ...base, ...overrides } as IAIService;
}

function failing(err: unknown) {
  return vi.fn().mockRejectedValue(err);
}

function wrap(primary: IAIService, secondary: IAIService): FailoverAIService {
  return new FailoverAIService(primary, secondary, { primary: 'gemini', secondary: 'groq' });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.mocked(console.info).mockRestore();
  vi.mocked(console.warn).mockRestore();
});

describe('FailoverAIService — primary-first calls', () => {
  it('serves from the primary when it succeeds and never touches the secondary', async () => {
    const primary = stubService();
    const secondary = stubService();
    const result = await wrap(primary, secondary).generateMealPlan(PLAN_INPUT);

    expect(result).toEqual({ days: [] });
    expect(primary.generateMealPlan).toHaveBeenCalledWith(PLAN_INPUT);
    expect(secondary.generateMealPlan).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith('[AI] generateMealPlan: served by gemini');
  });

  it('fails over to the secondary on a capacity/quota error', async () => {
    const primary = stubService({ generateMealPlan: failing(capacity429) });
    const secondary = stubService({
      generateMealPlan: vi.fn().mockResolvedValue({ days: [{ dayOfWeek: 0, meals: [] }] }),
    });
    const result = await wrap(primary, secondary).generateMealPlan(PLAN_INPUT);

    expect(result.days).toHaveLength(1);
    expect(secondary.generateMealPlan).toHaveBeenCalledWith(PLAN_INPUT);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'generateMealPlan: gemini capacity/quota error — failing over to groq',
      ),
    );
    expect(console.info).toHaveBeenCalledWith('[AI] generateMealPlan: served by groq (failover)');
  });

  it('fails over on status-less network timeouts too', async () => {
    const primary = stubService({ cheferizeRecipe: failing(new Error('fetch failed: ETIMEDOUT')) });
    const secondary = stubService();
    await expect(wrap(primary, secondary).cheferizeRecipe({} as never)).resolves.toEqual({
      adapted: { name: 'A' },
      changes: [],
    });
    expect(secondary.cheferizeRecipe).toHaveBeenCalled();
  });

  it('rethrows non-capacity errors without calling the secondary', async () => {
    const primary = stubService({ generateRecipeSwap: failing(validationError) });
    const secondary = stubService();
    await expect(wrap(primary, secondary).generateRecipeSwap({} as never)).rejects.toThrow(
      /failed validation/,
    );
    expect(secondary.generateRecipeSwap).not.toHaveBeenCalled();
  });

  it("propagates the secondary's error when both providers are exhausted", async () => {
    const secondary503 = Object.assign(new Error('secondary overloaded'), { status: 503 });
    const primary = stubService({ generateMealPlan: failing(capacity429) });
    const secondary = stubService({ generateMealPlan: failing(secondary503) });
    await expect(wrap(primary, secondary).generateMealPlan(PLAN_INPUT)).rejects.toThrow(
      'secondary overloaded',
    );
  });
});

describe('FailoverAIService — secondary-first (cheap high-volume) calls', () => {
  it.each(['chat', 'estimateIngredientPrices', 'generateShoppingList'] as const)(
    '%s goes to the secondary first',
    async (method) => {
      const primary = stubService();
      const secondary = stubService();
      const wrapped = wrap(primary, secondary);
      if (method === 'chat') await wrapped.chat([], { userId: 'u1', contextSummary: '' });
      if (method === 'estimateIngredientPrices') await wrapped.estimateIngredientPrices(['egg']);
      if (method === 'generateShoppingList')
        await wrapped.generateShoppingList({ ingredients: [], weekLabel: 'w' });

      expect(secondary[method]).toHaveBeenCalled();
      expect(primary[method]).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(`[AI] ${method}: served by groq`);
    },
  );

  it('falls back to Gemini on the secondary\'s 413 "request too large" (Groq TPM cap)', async () => {
    const tooLarge413 = Object.assign(
      new Error('Request too large for model … tokens per minute (TPM): Limit 8000'),
      { status: 413 },
    );
    const primary = stubService();
    const secondary = stubService({ generateShoppingList: failing(tooLarge413) });
    await expect(
      wrap(primary, secondary).generateShoppingList({ ingredients: [], weekLabel: 'w' }),
    ).resolves.toEqual({ items: [] });
    expect(primary.generateShoppingList).toHaveBeenCalled();
  });

  it('falls back to Gemini when the secondary throws a capacity error', async () => {
    const primary = stubService({
      estimateIngredientPrices: vi.fn().mockResolvedValue([{ ingredientName: 'egg' }]),
    });
    const secondary = stubService({ estimateIngredientPrices: failing(capacity429) });
    const result = await wrap(primary, secondary).estimateIngredientPrices(['egg']);

    expect(result).toEqual([{ ingredientName: 'egg' }]);
    expect(console.info).toHaveBeenCalledWith(
      '[AI] estimateIngredientPrices: served by gemini (failover)',
    );
  });
});

describe('FailoverAIService — vision stays primary-only', () => {
  it('analyzeMealPhoto never fails over, even on capacity errors', async () => {
    const primary = stubService({ analyzeMealPhoto: failing(capacity429) });
    const secondary = stubService();
    await expect(wrap(primary, secondary).analyzeMealPhoto('base64', 'image/jpeg')).rejects.toBe(
      capacity429,
    );
    expect(secondary.analyzeMealPhoto).not.toHaveBeenCalled();
  });

  it('extractRecipe with a photo source never fails over', async () => {
    const primary = stubService({ extractRecipe: failing(capacity429) });
    const secondary = stubService();
    await expect(
      wrap(primary, secondary).extractRecipe({ imageBase64: 'abcd', mimeType: 'image/jpeg' }),
    ).rejects.toBe(capacity429);
    expect(secondary.extractRecipe).not.toHaveBeenCalled();
  });

  it('extractRecipe with a text source does fail over', async () => {
    const primary = stubService({ extractRecipe: failing(capacity429) });
    const secondary = stubService();
    await expect(
      wrap(primary, secondary).extractRecipe({ text: 'Recipe: pasta…' }),
    ).resolves.toEqual({ name: 'Extracted' });
    expect(secondary.extractRecipe).toHaveBeenCalledWith({ text: 'Recipe: pasta…' });
  });
});

describe('FailoverAIService — coach review (P0-5 groundwork)', () => {
  it('serves the review from the primary and fails over on capacity errors', async () => {
    const primary = stubService({
      generateReviewText: vi.fn().mockRejectedValue(capacity429),
    });
    const secondary = stubService({ generateReviewText: vi.fn().mockResolvedValue('From Groq.') });
    const svc = new FailoverAIService(primary, secondary, { primary: 'gemini', secondary: 'groq' });
    const input = {
      adherencePct: 71,
      loggedDays: 5,
      avgDailyKcal: 1900,
      targetKcal: 2000,
      weightTrendKg: null,
      adjustmentKcal: 0,
      goal: null,
      dishNames: [],
    };
    await expect(svc.generateReviewText(input)).resolves.toBe('From Groq.');
    expect(primary.generateReviewText).toHaveBeenCalledWith(input);
  });
});

// ─── Route-driven chain (research §5.4 step 1) ───────────────────────────────

function chain(
  providers: Record<string, IAIService>,
  routes: Readonly<Record<AiWorkload, readonly string[]>> = DEFAULT_AI_ROUTES,
  shadow?: ShadowHook,
): ChainAIService {
  return new ChainAIService({
    providers: Object.fromEntries(
      Object.entries(providers).map(([name, service]) => [name, { name, service }]),
    ),
    routes,
    shadow,
  });
}

describe('ChainAIService — default routes equal today’s table', () => {
  it('serves every workload in the same order FailoverAIService did', () => {
    const svc = chain({ gemini: stubService(), groq: stubService() });
    expect(svc.chainNames('mealPlan')).toEqual(['gemini', 'groq']);
    expect(svc.chainNames('swap')).toEqual(['gemini', 'groq']);
    expect(svc.chainNames('cheferize')).toEqual(['gemini', 'groq']);
    expect(svc.chainNames('importText')).toEqual(['gemini', 'groq']);
    expect(svc.chainNames('review')).toEqual(['gemini', 'groq']);
    expect(svc.chainNames('chat')).toEqual(['groq', 'gemini']);
    expect(svc.chainNames('prices')).toEqual(['groq', 'gemini']);
    expect(svc.chainNames('shopping')).toEqual(['groq', 'gemini']);
    expect(svc.chainNames('vision')).toEqual(['gemini']);
    expect(svc.chainNames('video')).toEqual(['gemini']);
  });
});

describe('ChainAIService — overrides and failover order', () => {
  it('routes the meal plan groq-first when AI_ROUTE_MEAL_PLAN=groq>gemini', async () => {
    const gemini = stubService();
    const groq = stubService();
    const routes = resolveRoutes({ mealPlan: ['groq', 'gemini'] }, ['gemini', 'groq']);
    await chain({ gemini, groq }, routes).generateMealPlan(PLAN_INPUT);
    expect(groq.generateMealPlan).toHaveBeenCalled();
    expect(gemini.generateMealPlan).not.toHaveBeenCalled();
  });

  it('walks a three-provider chain in order on capacity errors', async () => {
    const a = stubService({ generateRecipeSwap: failing(capacity429) });
    const b = stubService({
      generateRecipeSwap: failing(Object.assign(new Error('too large'), { status: 413 })),
    });
    const c = stubService({ generateRecipeSwap: vi.fn().mockResolvedValue({ id: 'from-c' }) });
    const routes = { ...DEFAULT_AI_ROUTES, swap: ['a', 'b', 'c'] };
    const result = await chain(
      { a, b, c, gemini: stubService(), groq: stubService() },
      routes,
    ).generateRecipeSwap({} as never);
    expect(result).toEqual({ id: 'from-c' });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('a capacity/quota error — failing over to b'),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('b capacity/quota error — failing over to c'),
    );
    expect(console.info).toHaveBeenCalledWith('[AI] generateRecipeSwap: served by c (failover)');
  });

  it('stops at the first non-capacity error', async () => {
    const a = stubService({ generateRecipeSwap: failing(capacity429) });
    const b = stubService({ generateRecipeSwap: failing(validationError) });
    const c = stubService();
    const routes = { ...DEFAULT_AI_ROUTES, swap: ['a', 'b', 'c'] };
    await expect(
      chain({ a, b, c, gemini: stubService(), groq: stubService() }, routes).generateRecipeSwap(
        {} as never,
      ),
    ).rejects.toBe(validationError);
    expect(c.generateRecipeSwap).not.toHaveBeenCalled();
  });

  it('moves on from an input a provider flags as unsupported (failover: true)', async () => {
    const heic = Object.assign(new Error('image/heic not supported'), { failover: true });
    const groq = stubService({ analyzeMealPhoto: failing(heic) });
    const gemini = stubService();
    const routes = { ...DEFAULT_AI_ROUTES, vision: ['groq', 'gemini'] };
    await chain({ gemini, groq }, routes).analyzeMealPhoto('b64', 'image/heic');
    expect(gemini.analyzeMealPhoto).toHaveBeenCalledWith('b64', 'image/heic');
  });

  it('routes photo extraction by AI_ROUTE_VISION, but video always to Gemini', async () => {
    const gemini = stubService();
    const groq = stubService();
    const routes = { ...DEFAULT_AI_ROUTES, vision: ['groq'] };
    const svc = chain({ gemini, groq }, routes);
    await svc.extractRecipe({ imageBase64: 'abcd', mimeType: 'image/png' });
    expect(groq.extractRecipe).toHaveBeenCalled();
    await svc.extractRecipeAnnotated({ videoBase64: 'vid', mimeType: 'video/mp4' });
    expect(gemini.extractRecipeAnnotated).toHaveBeenCalled();
    expect(groq.extractRecipeAnnotated).not.toHaveBeenCalled();
  });

  it('refuses a workload with no configured provider', () => {
    expect(() =>
      chain({ gemini: stubService() }, { ...DEFAULT_AI_ROUTES, chat: ['groq'] }),
    ).toThrow(/no configured provider for workload "chat"/);
  });
});

describe('ChainAIService — shadow hook', () => {
  it('observes a served call with its input, result and provider', async () => {
    const observe = vi.fn();
    const svc = chain({ gemini: stubService(), groq: stubService() }, DEFAULT_AI_ROUTES, {
      observe,
    });
    await svc.generateMealPlan(PLAN_INPUT);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: 'mealPlan',
        op: 'generateMealPlan',
        input: PLAN_INPUT,
        result: { days: [] },
        servedBy: 'gemini',
      }),
    );
  });

  it('never observes chat (its tools write data) or video', async () => {
    const observe = vi.fn();
    const svc = chain({ gemini: stubService(), groq: stubService() }, DEFAULT_AI_ROUTES, {
      observe,
    });
    await svc.chat([], { userId: 'u1', contextSummary: '' });
    await svc.extractRecipeAnnotated({ videoBase64: 'v' });
    expect(observe).not.toHaveBeenCalled();
  });

  it('a throwing hook cannot break the user’s call', async () => {
    const svc = chain({ gemini: stubService(), groq: stubService() }, DEFAULT_AI_ROUTES, {
      observe: () => {
        throw new Error('boom');
      },
    });
    await expect(svc.generateMealPlan(PLAN_INPUT)).resolves.toEqual({ days: [] });
  });
});
