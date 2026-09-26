import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CF_NEURON_RATES,
  estimateNeurons,
  NeuronLedger,
  neuronsForCall,
  textBudgetAllows,
} from './cloudflare-budget.js';
import { ChainAIService, isFailoverWorthy } from './failover.js';
import { AI_OVER_CAPACITY_MESSAGE, toFriendlyAiError } from './friendly-error.js';
import { OpenAICompatibleAIService } from './openai.js';
import {
  cloudflareBaseUrl,
  cloudflareVisionExtras,
  configuredProviders,
  createProvider,
  type ProviderConfig,
} from './providers.js';
import type { IAIService } from './types.js';

// Workers AI as a text provider (free-only mode). Mocked HTTP only — the real
// endpoint was probed separately (docs/ai-providers.md "Free-only mode").

const CF = {
  accountId: 'acct',
  apiToken: 'tok',
  textModel: '@cf/openai/gpt-oss-120b',
  visionModel: '@cf/google/gemma-4-26b-a4b-it',
  textNeuronBudget: 8_000,
};

const CONFIG: ProviderConfig = {
  geminiModel: 'g',
  geminiFastModel: 'f',
  secondaryApiKey: 'gsk',
  secondaryBaseUrl: 'https://api.groq.com/openai/v1',
  secondaryModel: 'openai/gpt-oss-120b',
  visionModel: 'qwen/qwen3.8-27b',
  cloudflare: CF,
};

/** A Workers AI chat completion, with its usage.neurons like the real one. */
function cfCompletion(content: unknown, usage: Record<string, number>) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }],
      usage,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

function body(n = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[n]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('neuron maths', () => {
  it('matches what Workers AI charged in the live probe (92 in / 57 out on gpt-oss-120b = 6.81)', () => {
    expect(estimateNeurons('@cf/openai/gpt-oss-120b', 92, 57)).toBeCloseTo(6.81, 2);
  });

  it('prefers the reported cost, then the header, then the rate table', () => {
    const model = '@cf/openai/gpt-oss-20b';
    expect(neuronsForCall({ reported: 3.5, header: '9', model })).toBe(3.5);
    expect(neuronsForCall({ header: '9.25', model })).toBe(9.25);
    expect(neuronsForCall({ model, inputTokens: 1_000_000, outputTokens: 0 })).toBe(
      CF_NEURON_RATES[model]!.input,
    );
  });

  it('prices an unknown model at the dearest rates (never under-counts)', () => {
    expect(estimateNeurons('@cf/new/model', 0, 1_000_000)).toBe(204_805);
  });
});

describe('NeuronLedger', () => {
  it('counts per UTC day and resets at midnight UTC', () => {
    let now = Date.parse('2026-09-26T23:59:00Z');
    const ledger = new NeuronLedger(() => now);
    ledger.record(7_999);
    ledger.record(-5);
    ledger.record(Number.NaN);
    expect(ledger.usedToday()).toBe(7_999);
    expect(textBudgetAllows({ ledger, textLimit: 8_000 })).toBe(true);
    ledger.record(1);
    expect(textBudgetAllows({ ledger, textLimit: 8_000 })).toBe(false);
    now = Date.parse('2026-09-27T00:00:01Z');
    expect(ledger.usedToday()).toBe(0);
    expect(textBudgetAllows({ ledger, textLimit: 8_000 })).toBe(true);
  });
});

describe('cloudflare provider', () => {
  it('is configured only when its settings are passed (the image keys alone never enable it)', () => {
    expect(configuredProviders(CONFIG)).toEqual(['groq', 'cloudflare']);
    expect(configuredProviders({ ...CONFIG, cloudflare: undefined })).toEqual(['groq']);
  });

  it("calls Workers AI's OpenAI-compatible endpoint with the token, low reasoning and chunked plans", async () => {
    const ref = createProvider('cloudflare', CONFIG);
    expect(ref.name).toBe('workers-ai/@cf/openai/gpt-oss-120b');
    fetchMock.mockResolvedValueOnce(
      cfCompletion(
        { items: [{ ingredientName: 'rice', quantity: '200', unit: 'g' }] },
        { prompt_tokens: 100, completion_tokens: 50, neurons: 6.6 },
      ),
    );
    await ref.service.generateShoppingList({ ingredients: [], weekLabel: 'w' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/ai/v1/chat/completions');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok');
    expect(body()).toMatchObject({ model: '@cf/openai/gpt-oss-120b', reasoning_effort: 'low' });
    expect(cloudflareBaseUrl('a/b')).toContain('accounts/a%2Fb/ai/v1');
  });

  it('turns Gemma 4 thinking off for photos, and sends no reasoning_effort to the vision model', async () => {
    expect(cloudflareVisionExtras('@cf/google/gemma-4-26b-a4b-it')).toEqual({
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(cloudflareVisionExtras('@cf/mistralai/mistral-small-3.1-24b-instruct')).toBeUndefined();
    const ref = createProvider('cloudflare', CONFIG);
    fetchMock.mockResolvedValueOnce(
      cfCompletion(
        {
          dishName: 'Pasta',
          confidence: 'med',
          kcal: 600,
          protein: 20,
          carbs: 80,
          fat: 18,
          portionNote: 'one plate',
        },
        { prompt_tokens: 300, completion_tokens: 40, neurons: 3.8 },
      ),
    );
    await ref.service.analyzeMealPhoto('aGk=', 'image/jpeg');
    const sent = body();
    expect(sent['model']).toBe('@cf/google/gemma-4-26b-a4b-it');
    expect(sent['chat_template_kwargs']).toEqual({ enable_thinking: false });
    expect(sent['reasoning_effort']).toBeUndefined();
  });
});

describe('neuron budget', () => {
  function cfService(ledger: NeuronLedger, textLimit = 10) {
    return new OpenAICompatibleAIService({
      apiKey: 'tok',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acct/ai/v1',
      model: '@cf/openai/gpt-oss-120b',
      neuronBudget: { ledger, textLimit },
      providerLabel: 'cloudflare',
    });
  }

  it('records each call and logs the running total', async () => {
    const ledger = new NeuronLedger();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(
      cfCompletion({ items: [] }, { prompt_tokens: 92, completion_tokens: 57, neurons: 6.81 }),
    );
    await cfService(ledger).generateShoppingList({ ingredients: [], weekLabel: 'w' });
    expect(ledger.usedToday()).toBeCloseTo(6.81);
    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[ai.usage]'));
    expect(line).toContain('"provider":"cloudflare"');
    expect(line).toContain('"neurons":6.81');
    expect(line).toContain('"neuronsToday":7');
  });

  it('stops sending text once the share is used up, as a failover-worthy capacity error', async () => {
    const ledger = new NeuronLedger();
    ledger.record(10);
    const err = await cfService(ledger)
      .generateShoppingList({ ingredients: [], weekLabel: 'w' })
      .catch((e: unknown) => e);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((err as { status?: number }).status).toBe(429);
    expect(isFailoverWorthy(err)).toBe(true);
    expect(toFriendlyAiError(err, 'x', 'fallback').message).toBe(AI_OVER_CAPACITY_MESSAGE);
  });
});

describe('fast model', () => {
  it('serves the simple JSON workloads when set, and nothing else', async () => {
    const service = new OpenAICompatibleAIService({
      apiKey: 'k',
      baseUrl: 'https://api.groq.test/openai/v1',
      model: 'openai/gpt-oss-120b',
      reasoningEffort: 'low',
      fastModel: 'openai/gpt-oss-20b',
      fastReasoningEffort: 'low',
    });
    fetchMock
      .mockResolvedValueOnce(
        cfCompletion({ items: [] }, { prompt_tokens: 1, completion_tokens: 1 }),
      )
      .mockResolvedValueOnce(
        cfCompletion(
          { name: 'x', ingredients: [], instructions: [], nutritionInfo: {} },
          { prompt_tokens: 1, completion_tokens: 1 },
        ),
      );
    await service.estimateIngredientPrices(['rice']);
    expect(body(0)).toMatchObject({ model: 'openai/gpt-oss-20b', reasoning_effort: 'low' });
    await service
      .generateRecipeSwap({
        userId: 'u',
        originalRecipeName: 'a',
        mealType: 'dinner',
        preferences: { dietaryRestrictions: [], allergies: [], cuisinePreferences: [] },
      })
      .catch(() => undefined);
    expect(body(1)).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low' });
  });
});

describe('groq>cloudflare chain', () => {
  function stub(fn: () => Promise<unknown>): IAIService {
    return { generateRecipeSwap: fn } as unknown as IAIService;
  }
  const routes = Object.fromEntries(
    [
      'mealPlan',
      'swap',
      'cheferize',
      'importText',
      'vision',
      'chat',
      'review',
      'prices',
      'shopping',
    ].map((w) => [w, ['groq', 'cloudflare']]),
  ) as never;
  const input = {
    userId: 'u',
    originalRecipeName: 'a',
    mealType: 'dinner' as const,
    preferences: { dietaryRestrictions: [], allergies: [], cuisinePreferences: [] },
  };
  const groqDailyCap = Object.assign(new Error('HTTP 429 — rate_limit_exceeded (RPD)'), {
    status: 429,
  });
  const cfDailyCap = Object.assign(
    new Error(
      'HTTP 429 — {"errors":[{"code":3036,"message":"You have used up your daily free allocation of 10,000 neurons."}]}',
    ),
    { status: 429 },
  );

  it('fails over to Cloudflare when Groq is out of quota', async () => {
    const chain = new ChainAIService({
      providers: {
        groq: { name: 'groq', service: stub(() => Promise.reject(groqDailyCap)) },
        cloudflare: { name: 'cf', service: stub(() => Promise.resolve({ name: 'From CF' })) },
      },
      routes,
    });
    await expect(chain.generateRecipeSwap(input)).resolves.toEqual({ name: 'From CF' });
  });

  it('surfaces the friendly over-capacity message when both are out', async () => {
    const chain = new ChainAIService({
      providers: {
        groq: { name: 'groq', service: stub(() => Promise.reject(groqDailyCap)) },
        cloudflare: { name: 'cf', service: stub(() => Promise.reject(cfDailyCap)) },
      },
      routes,
    });
    const err = await chain.generateRecipeSwap(input).catch((e: unknown) => e);
    const friendly = toFriendlyAiError(err, 'swap', 'fallback');
    expect(friendly.code).toBe('SERVICE_UNAVAILABLE');
    expect(friendly.message).toBe(AI_OVER_CAPACITY_MESSAGE);
  });
});
