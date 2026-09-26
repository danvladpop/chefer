import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithAiCallContext } from './call-context.js';
import { DAY_PLAN_JSON_SCHEMA, isBackgroundCall, OpenAICompatibleAIService } from './openai.js';
import type { MealPlanInput, RecipeData, ShoppingListInput, SwapInput } from './types.js';

// Fixture responses only — no live calls (§8 AI-cost rule).

const BASE = {
  apiKey: 'k',
  baseUrl: 'https://api.groq.test/openai/v1',
  model: 'openai/gpt-oss-120b',
};

function completion(content: unknown, usage = { prompt_tokens: 10, completion_tokens: 5 }) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }],
      usage,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

/** The parsed JSON body of the n-th fetch call. */
function body(fetchMock: ReturnType<typeof vi.fn>, n = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[n]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function recipe(name: string, calories = 500): RecipeData {
  return {
    id: `recipe_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    description: 'Tasty.',
    ingredients: [{ name: 'rice', quantity: 100, unit: 'g' }],
    instructions: ['Cook.'],
    nutritionInfo: { calories, protein: 30, carbs: 50, fat: 15, fiber: 5 },
    cuisineType: 'International',
    dietaryTags: [],
    prepTimeMins: 5,
    cookTimeMins: 10,
    servings: 1,
    imageUrl: 'https://hallucinated.example/img.jpg',
  };
}

const PLAN_INPUT: MealPlanInput = {
  userId: 'u1',
  goal: 'MAINTAIN',
  biologicalSex: 'FEMALE',
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activityLevel: 'MODERATELY_ACTIVE',
  dailyCalorieTarget: 1500,
  dietaryRestrictions: [],
  allergies: ['peanuts'],
  dislikedIngredients: [],
  cuisinePreferences: [],
  mealsPerDay: 3,
  servingSize: 1,
};

const SWAP_INPUT: SwapInput = {
  userId: 'u1',
  originalRecipeName: 'Old dish',
  mealType: 'dinner',
  preferences: { dietaryRestrictions: [], allergies: [], cuisinePreferences: [] },
};

const SHOP_INPUT: ShoppingListInput = { ingredients: [], weekLabel: 'this week' };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenAICompatibleAIService — vision (research §5.4 step 2)', () => {
  const PHOTO = {
    dishName: 'Pasta',
    confidence: 'med',
    kcal: 612.4,
    protein: 20.6,
    carbs: 80,
    fat: 21,
    portionNote: 'plate',
  };

  it('sends the photo as an image_url data-URL part to the vision model', async () => {
    fetchMock.mockResolvedValue(completion(PHOTO));
    const svc = new OpenAICompatibleAIService({ ...BASE, visionModel: 'qwen/qwen3.8-27b' });

    const result = await svc.analyzeMealPhoto('QUJD', 'image/jpeg');

    const req = body(fetchMock);
    expect(req['model']).toBe('qwen/qwen3.8-27b');
    expect(req['response_format']).toEqual({ type: 'json_object' });
    const messages = req['messages'] as { role: string; content: unknown }[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: expect.stringContaining('Identify this meal') },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
      ],
    });
    // Same bounds + rounding gate as Gemini.
    expect(result).toMatchObject({ dishName: 'Pasta', kcal: 612, protein: 21 });
  });

  it('extracts a recipe from a photo with the vision model', async () => {
    fetchMock.mockResolvedValue(
      completion({
        name: 'Card recipe',
        description: 'd',
        ingredients: [{ name: 'egg', quantity: 2, unit: 'piece' }],
        instructions: ['Whisk.'],
        nutritionInfo: { calories: 150, protein: 12, carbs: 1, fat: 10, fiber: 0 },
        cuisineType: 'French',
        dietaryTags: [],
        prepTimeMins: 2,
        cookTimeMins: 5,
        servings: 1,
      }),
    );
    const svc = new OpenAICompatibleAIService({ ...BASE, visionModel: 'qwen/qwen3.8-27b' });

    await expect(
      svc.extractRecipe({ imageBase64: 'SU1H', mimeType: 'image/png' }),
    ).resolves.toMatchObject({
      name: 'Card recipe',
    });
    const req = body(fetchMock);
    expect(req['model']).toBe('qwen/qwen3.8-27b');
    const content = (req['messages'] as { content: unknown }[])[1]?.content;
    expect(content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,SU1H' },
    });
  });

  it('text extraction stays on the text model with a plain string message', async () => {
    fetchMock.mockResolvedValue(
      completion({
        name: 'Soup',
        description: 'd',
        ingredients: [],
        instructions: [],
        nutritionInfo: { calories: 1, protein: 1, carbs: 1, fat: 1, fiber: 1 },
        cuisineType: 'x',
        dietaryTags: [],
        prepTimeMins: 1,
        cookTimeMins: 1,
        servings: 1,
      }),
    );
    const svc = new OpenAICompatibleAIService({ ...BASE, visionModel: 'qwen/qwen3.8-27b' });
    await svc.extractRecipe({ text: 'Soup: water' });
    const req = body(fetchMock);
    expect(req['model']).toBe('openai/gpt-oss-120b');
    expect(typeof (req['messages'] as { content: unknown }[])[1]?.content).toBe('string');
  });

  it('refuses photos without a vision model', async () => {
    const svc = new OpenAICompatibleAIService(BASE);
    await expect(svc.analyzeMealPhoto('QUJD', 'image/jpeg')).rejects.toThrow(/no vision model/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags HEIC as a failover-worthy unsupported input (no request made)', async () => {
    const svc = new OpenAICompatibleAIService({ ...BASE, visionModel: 'v' });
    await expect(svc.analyzeMealPhoto('QUJD', 'image/heic')).rejects.toMatchObject({
      failover: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('OpenAICompatibleAIService — chunked meal plan (research §5.4 step 3)', () => {
  function dayResponse(dayOfWeek: number) {
    return completion({
      dayOfWeek: 6 - dayOfWeek, // a model that mislabels the day — position wins
      meals: [
        { type: 'breakfast', recipe: recipe(`Breakfast ${dayOfWeek}`, 400) },
        { type: 'lunch', recipe: recipe(`Lunch ${dayOfWeek}`, 500) },
        { type: 'dinner', recipe: recipe(`Dinner ${dayOfWeek}`, 600) },
      ],
    });
  }

  it('makes 7 strict-schema day calls and assembles a validated week', async () => {
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(dayResponse(d));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });

    const plan = await svc.generateMealPlan(PLAN_INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(plan.days.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plan.days[3]?.meals.map((m) => m.recipe.name)).toEqual([
      'Breakfast 3',
      'Lunch 3',
      'Dinner 3',
    ]);
    // Images always come from our own pipeline.
    expect(plan.days.flatMap((d) => d.meals).every((m) => m.recipe.imageUrl === null)).toBe(true);

    const first = body(fetchMock, 0);
    expect(first['response_format']).toEqual({
      type: 'json_schema',
      json_schema: { name: 'day_plan', strict: true, schema: DAY_PLAN_JSON_SCHEMA },
    });
    const user = (first['messages'] as { content: string }[])[1]?.content ?? '';
    expect(user).toContain('Generate ONLY day 0 (Monday)');
    expect(user).toContain('Allergies: peanuts');

    // Later days list the dishes already planned, so the week doesn't repeat.
    const third = (body(fetchMock, 2)['messages'] as { content: string }[])[1]?.content ?? '';
    expect(third).toContain('Generate ONLY day 2 (Wednesday)');
    expect(third).toContain('Already planned on earlier days');
    expect(third).toContain('Dinner 1');
  });

  it('keeps the single 6K-token call when not chunked (failover behind Gemini)', async () => {
    fetchMock.mockResolvedValue(completion({ days: [] }));
    const svc = new OpenAICompatibleAIService(BASE);
    await svc.generateMealPlan(PLAN_INPUT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body(fetchMock)['max_tokens']).toBe(6000);
    expect(body(fetchMock)['response_format']).toEqual({ type: 'json_object' });
  });

  it('fails the whole week when one day still fails validation after the repair retry', async () => {
    fetchMock.mockResolvedValueOnce(dayResponse(0));
    fetchMock.mockResolvedValueOnce(completion({ dayOfWeek: 1, meals: [{ type: 'brunch' }] }));
    fetchMock.mockResolvedValueOnce(completion({ dayOfWeek: 1, meals: [{ type: 'brunch' }] }));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });
    await expect(svc.generateMealPlan(PLAN_INPUT)).rejects.toThrow(/failed validation/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a strict-mode json_validate_failed day in json_object mode, keeping strict for later days', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        '{"error":{"message":"Failed to validate JSON. Please adjust your prompt.","type":"invalid_request_error","code":"json_validate_failed","failed_generation":""}}',
        { status: 400 },
      ),
    );
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(dayResponse(d));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });

    const plan = await svc.generateMealPlan(PLAN_INPUT);
    expect(plan.days).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(8);
    const retry = body(fetchMock, 1);
    expect(retry['response_format']).toEqual({ type: 'json_object' });
    // json_object mode carries the prose shape; strict mode does not need it.
    const system = (retry['messages'] as { content: string }[])[0]?.content ?? '';
    expect(system).toContain('"dayOfWeek":number');
    // A failed generation is not "json_schema unsupported" — day 2 is strict again.
    expect(body(fetchMock, 2)['response_format']).toMatchObject({ type: 'json_schema' });
  });

  it('also retries a strict day Groq rejects as "does not match the expected schema" (eval 2026-09-26)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        `{"error":{"message":"Generated JSON does not match the expected schema. Please adjust your prompt. See 'failed_generation' for more details. Error: jsonschema: '/meals/2/recipe/nutritionInfo/carbs' does not validate with /properties/meals/items/properties/recipe/properties/nutritionInfo/properties/carbs/type: expected number, but got string${' '.repeat(200)}","code":"json_validate_failed"}}`,
        { status: 400 },
      ),
    );
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(dayResponse(d));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });
    const plan = await svc.generateMealPlan(PLAN_INPUT);
    expect(plan.days).toHaveLength(7);
    expect(body(fetchMock, 1)['response_format']).toEqual({ type: 'json_object' });
  });

  it('gives a truncated strict day 1.5x the output budget on its json_object retry', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        '{"error":{"message":"max completion tokens reached before generating a valid document: the output was truncated","code":"json_validate_failed"}}',
        { status: 400 },
      ),
    );
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(dayResponse(d));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });
    await svc.generateMealPlan(PLAN_INPUT);
    expect(body(fetchMock, 0)['max_tokens']).toBe(4000);
    expect(body(fetchMock, 1)['max_tokens']).toBe(6000);
  });

  it('repairs an invalid day once, showing the model its output and the error', async () => {
    fetchMock.mockResolvedValueOnce(completion({ dayOfWeek: 0, meals: [{ type: 'brunch' }] }));
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(dayResponse(d));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });

    const plan = await svc.generateMealPlan(PLAN_INPUT);
    expect(plan.days).toHaveLength(7);
    const repair = body(fetchMock, 1);
    expect(repair['response_format']).toEqual({ type: 'json_object' });
    const messages = repair['messages'] as { role: string; content: string }[];
    expect(messages).toHaveLength(4);
    expect(messages[2]).toMatchObject({ role: 'assistant' });
    expect(messages[2]?.content).toContain('brunch');
    expect(messages[3]?.content).toMatch(/rejected: response failed validation/);
  });

  function limitedDay(d: number) {
    const res = completion(
      { dayOfWeek: d, meals: [{ type: 'breakfast', recipe: recipe(`Meal ${d}`) }] },
      { prompt_tokens: 900, completion_tokens: 1100 },
    );
    res.headers.set('x-ratelimit-limit-tokens', '8000');
    res.headers.set('x-ratelimit-remaining-tokens', '500');
    return res;
  }

  it('paces days until the per-minute budget admits prompt + max_tokens', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(limitedDay(d));
    const svc = new OpenAICompatibleAIService({
      ...BASE,
      mealPlanMode: 'chunked',
      sleep,
      now: () => 0,
    });

    await svc.generateMealPlan(PLAN_INPUT);
    // Day 0 (budget unknown) runs at once. Every later day needs 900 prompt
    // + 50 growth + 4,000 max_tokens = 4,950 admitted; 500 are left, so it
    // waits for 4,450 tokens at 8,000/60 s = 33.375 s. A background plan
    // (no user context) may wait for all six.
    expect(sleep).toHaveBeenCalledTimes(6);
    expect(sleep).toHaveBeenCalledWith(33_375);
  });

  it('caps pacing for a plan a user is waiting on', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(limitedDay(d));
    const svc = new OpenAICompatibleAIService({
      ...BASE,
      mealPlanMode: 'chunked',
      sleep,
      now: () => 0,
    });
    await runWithAiCallContext({ userId: 'u', premium: true }, () =>
      svc.generateMealPlan(PLAN_INPUT),
    );
    // 120 s interactive budget: three 33 s waits fit, a fourth does not.
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('waits out a short per-minute 429 once, then continues', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(dayResponse(0));
    fetchMock.mockResolvedValueOnce(
      new Response('rate limited', { status: 429, headers: { 'retry-after': '7' } }),
    );
    for (let d = 1; d < 7; d++) fetchMock.mockResolvedValueOnce(dayResponse(d));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked', sleep });

    const plan = await svc.generateMealPlan(PLAN_INPUT);
    expect(plan.days).toHaveLength(7);
    expect(sleep).toHaveBeenCalledWith(7250); // Retry-After + jitter
  });

  it('propagates a long 429 (daily quota) so the chain can fail over', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(
      new Response('daily limit', { status: 429, headers: { 'retry-after': '3600' } }),
    );
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked', sleep });
    await expect(svc.generateMealPlan(PLAN_INPUT)).rejects.toMatchObject({ status: 429 });
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('OpenAICompatibleAIService — reasoning effort', () => {
  it('sends reasoning_effort with text-model calls only, never to the vision model', async () => {
    fetchMock.mockResolvedValueOnce(completion(recipe('Swap')));
    fetchMock.mockResolvedValueOnce(
      completion({
        dishName: 'Pasta',
        confidence: 'med',
        kcal: 600,
        protein: 20,
        carbs: 80,
        fat: 20,
        portionNote: 'one plate',
      }),
    );
    const svc = new OpenAICompatibleAIService({
      ...BASE,
      visionModel: 'qwen/qwen3.8-27b',
      reasoningEffort: 'low',
    });
    await svc.generateRecipeSwap(SWAP_INPUT);
    await svc.analyzeMealPhoto('aGk=', 'image/jpeg');
    expect(body(fetchMock, 0)['reasoning_effort']).toBe('low');
    expect(body(fetchMock, 1)['model']).toBe('qwen/qwen3.8-27b');
    expect(body(fetchMock, 1)).not.toHaveProperty('reasoning_effort');
  });

  it('omits it when not configured (non-reasoning models reject it)', async () => {
    fetchMock.mockResolvedValueOnce(completion({ items: [] }));
    const svc = new OpenAICompatibleAIService(BASE);
    await svc.generateShoppingList(SHOP_INPUT);
    expect(body(fetchMock)).not.toHaveProperty('reasoning_effort');
  });
});

describe('OpenAICompatibleAIService — 429 handling (background vs interactive)', () => {
  const rateLimited = (headers: Record<string, string> = { 'retry-after': '3' }, text = 'rl') =>
    new Response(text, { status: 429, headers });

  it('classifies background calls: background ops, no user context, shadow replays', () => {
    expect(isBackgroundCall('generateShoppingList')).toBe(true);
    expect(isBackgroundCall('generateRecipeSwap')).toBe(true); // no context = worker/script
    runWithAiCallContext({ userId: 'u', premium: true }, () => {
      expect(isBackgroundCall('generateRecipeSwap')).toBe(false);
      expect(isBackgroundCall('estimateIngredientPrices')).toBe(true);
    });
    runWithAiCallContext({ userId: 'u', premium: true, shadow: true }, () => {
      expect(isBackgroundCall('generateRecipeSwap')).toBe(true);
    });
    // Chunks pace themselves.
    expect(isBackgroundCall('generateMealPlan.day')).toBe(false);
  });

  it('a background call waits out one short 429 and retries', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(rateLimited());
    fetchMock.mockResolvedValueOnce(completion({ items: [] }));
    const svc = new OpenAICompatibleAIService({ ...BASE, sleep });
    await expect(svc.generateShoppingList(SHOP_INPUT)).resolves.toEqual({
      items: [],
    });
    expect(sleep).toHaveBeenCalledWith(3250);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads the wait from the body when there is no Retry-After header', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(rateLimited({}, 'Please try again in 4.5s.'));
    fetchMock.mockResolvedValueOnce(completion({ items: [] }));
    const svc = new OpenAICompatibleAIService({ ...BASE, sleep });
    await svc.generateShoppingList(SHOP_INPUT);
    expect(sleep).toHaveBeenCalledWith(4750);
  });

  it('retries only once, and never for a long wait', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(rateLimited());
    fetchMock.mockResolvedValueOnce(rateLimited());
    const svc = new OpenAICompatibleAIService({ ...BASE, sleep });
    await expect(svc.generateShoppingList(SHOP_INPUT)).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(rateLimited({ 'retry-after': '45' }));
    await expect(svc.generateShoppingList(SHOP_INPUT)).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 45_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('an interactive call fails straight away so the chain can fail over', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce(rateLimited());
    const svc = new OpenAICompatibleAIService({ ...BASE, sleep });
    await expect(
      runWithAiCallContext({ userId: 'u', premium: true }, () =>
        svc.generateRecipeSwap(SWAP_INPUT),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
