import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailoverAIService } from './failover.js';
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
    cheferizeRecipe: vi.fn().mockResolvedValue({ adapted: { name: 'A' }, changes: [] }),
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
