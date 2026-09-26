import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_PLAN_JSON_SCHEMA, OpenAICompatibleAIService } from './openai.js';
import type { MealPlanInput, RecipeData } from './types.js';

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

  it('refuses photos without a vision model, and video always', async () => {
    const svc = new OpenAICompatibleAIService(BASE);
    await expect(svc.analyzeMealPhoto('QUJD', 'image/jpeg')).rejects.toThrow(/no vision model/);
    const withVision = new OpenAICompatibleAIService({ ...BASE, visionModel: 'v' });
    await expect(withVision.extractRecipeAnnotated({ videoBase64: 'v' })).rejects.toThrow(
      /Gemini-only/,
    );
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

  it('fails the whole week when one day fails validation', async () => {
    fetchMock.mockResolvedValueOnce(dayResponse(0));
    fetchMock.mockResolvedValueOnce(completion({ dayOfWeek: 1, meals: [{ type: 'brunch' }] }));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });
    await expect(svc.generateMealPlan(PLAN_INPUT)).rejects.toThrow(/failed validation/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to json_object once when the endpoint rejects strict json_schema', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"response_format json_schema is not supported"}', { status: 400 }),
    );
    for (let d = 0; d < 7; d++) fetchMock.mockResolvedValueOnce(dayResponse(d));
    const svc = new OpenAICompatibleAIService({ ...BASE, mealPlanMode: 'chunked' });

    await expect(svc.generateMealPlan(PLAN_INPUT)).resolves.toMatchObject({
      days: expect.any(Array),
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(body(fetchMock, 1)['response_format']).toEqual({ type: 'json_object' });
    // Remembered: later days don't retry strict mode.
    expect(body(fetchMock, 7)['response_format']).toEqual({ type: 'json_object' });
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
    expect(sleep).toHaveBeenCalledWith(7000);
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
