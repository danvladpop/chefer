import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateAiUsageEventData } from '@chefer/database';
import {
  runOutsideAiCallContext,
  runWithAiCallContext,
  runWithAiUsageScope,
} from './call-context.js';
import { ChainAIService } from './failover.js';
import { AI_WORKLOADS, type AiWorkload } from './routing.js';
import type { IAIService, SwapInput } from './types.js';
import { startAiUsageRecording, toUsageEvent, workloadForOp } from './usage-recorder.js';
import { logAiUsage } from './usage.js';

// ─── Usage recorder (Phase 2 cost tracking) ───────────────────────────────────
// Fixture providers only — no live calls (§8 AI-cost rule).

const capacity429 = Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 });

let rows: CreateAiUsageEventData[];
let stop: () => void;
let onRecorded: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  rows = [];
  onRecorded = vi.fn();
  stop = startAiUsageRecording({
    write: (event) => {
      rows.push(event);
      return Promise.resolve();
    },
    onRecorded,
  });
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

/** Lets the detached write promises settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A provider whose swap logs usage like a real client, then returns or throws. */
function provider(
  name: string,
  model: string,
  outcome: { tokens?: { in: number; out: number }; error?: Error },
): IAIService {
  const swap = vi.fn(async () => {
    if (outcome.tokens) {
      logAiUsage({
        provider: name,
        model,
        op: 'generateRecipeSwap',
        inputTokens: outcome.tokens.in,
        outputTokens: outcome.tokens.out,
        ms: 5,
      });
    }
    await Promise.resolve();
    if (outcome.error) throw outcome.error;
    return { id: 'r1' };
  });
  return { generateRecipeSwap: swap } as unknown as IAIService;
}

function chain(first: IAIService, second: IAIService): ChainAIService {
  const routes = {} as Record<AiWorkload, string[]>;
  for (const w of AI_WORKLOADS) routes[w] = ['groq', 'cloudflare'];
  return new ChainAIService({
    providers: {
      groq: { service: first, name: 'groq' },
      cloudflare: { service: second, name: 'cloudflare' },
    },
    routes,
  });
}

describe('AI usage recorder', () => {
  it('records one row per call with tokens, workload, user and estimated cost', async () => {
    await runWithAiCallContext({ userId: 'u1', premium: true }, () =>
      chain(
        provider('api.groq.com', 'openai/gpt-oss-120b', { tokens: { in: 2_000, out: 500 } }),
        provider('cloudflare', '@cf/openai/gpt-oss-120b', {}),
      ).generateRecipeSwap({} as SwapInput),
    );
    await settle();
    expect(rows).toEqual([
      expect.objectContaining({
        userId: 'u1',
        operation: 'generateRecipeSwap',
        workload: 'swap',
        provider: 'api.groq.com',
        model: 'openai/gpt-oss-120b',
        inputTokens: 2_000,
        outputTokens: 500,
        costMicroUsd: 600,
        shadow: false,
      }),
    ]);
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ costMicroUsd: 600 }));
  });

  it('failover: the provider that served is charged, and a failed attempt that reported usage too', async () => {
    const validationFailure = Object.assign(new Error('schema rejected'), { failover: true });
    await runWithAiCallContext({ userId: 'u1', premium: true }, () =>
      chain(
        // Spent tokens, then its reply was rejected → failover.
        provider('api.groq.com', 'openai/gpt-oss-120b', {
          tokens: { in: 1_000, out: 1_000 },
          error: validationFailure,
        }),
        provider('cloudflare', '@cf/openai/gpt-oss-120b', { tokens: { in: 1_000, out: 1_000 } }),
      ).generateRecipeSwap({} as SwapInput),
    );
    await settle();
    expect(rows.map((r) => [r.provider, r.model, r.costMicroUsd, r.workload])).toEqual([
      ['api.groq.com', 'openai/gpt-oss-120b', 750, 'swap'],
      ['cloudflare', '@cf/openai/gpt-oss-120b', 1_100, 'swap'],
    ]);
  });

  it('a failed attempt with no usage (HTTP 429) records nothing', async () => {
    await chain(
      provider('api.groq.com', 'openai/gpt-oss-120b', { error: capacity429 }),
      provider('cloudflare', '@cf/openai/gpt-oss-120b', { tokens: { in: 10, out: 10 } }),
    ).generateRecipeSwap({} as SwapInput);
    await settle();
    expect(rows.map((r) => r.provider)).toEqual(['cloudflare']);
  });

  it('background work is system (null user); a billing scope charges a user without a request', async () => {
    logAiUsage({
      provider: 'p',
      model: 'openai/gpt-oss-20b',
      op: 'estimateIngredientPrices',
      ms: 1,
    });
    await runWithAiUsageScope({ billedUserId: 'owner' }, async () => {
      logAiUsage({ provider: 'p', model: 'openai/gpt-oss-20b', op: 'generateMealPlan.day', ms: 1 });
      // A worker woken from inside the billed scope is detached from it.
      runOutsideAiCallContext(() =>
        logAiUsage({ provider: 'p', model: 'openai/gpt-oss-20b', op: 'recipeImage', ms: 1 }),
      );
    });
    await settle();
    expect(rows.map((r) => [r.operation, r.userId, r.workload])).toEqual([
      ['estimateIngredientPrices', null, 'prices'],
      ['generateMealPlan.day', 'owner', 'mealPlan'],
      ['recipeImage', null, 'recipeImage'],
    ]);
  });

  it('shadow replays are recorded (they cost money) but charged to nobody', async () => {
    await runWithAiCallContext({ userId: 'u1', premium: true, shadow: true }, async () => {
      logAiUsage({
        provider: 'p',
        model: 'openai/gpt-oss-120b',
        op: 'chat',
        inputTokens: 10,
        ms: 1,
      });
    });
    await settle();
    expect(rows[0]).toMatchObject({ userId: null, shadow: true, workload: 'chat' });
  });

  it('records audio seconds and images', async () => {
    logAiUsage({
      provider: 'api.groq.com',
      model: 'whisper-large-v3-turbo',
      op: 'transcribe',
      audioSeconds: 90,
      ms: 1,
    });
    logAiUsage({
      provider: 'cloudflare',
      model: '@cf/black-forest-labs/flux-1-schnell',
      op: 'recipeImage',
      images: 1,
      ms: 1,
    });
    await settle();
    expect(rows).toEqual([
      expect.objectContaining({ audioSeconds: 90, costMicroUsd: 1_000, workload: 'transcription' }),
      expect.objectContaining({ images: 1, costMicroUsd: 640, workload: 'recipeImage' }),
    ]);
  });

  it('a failing write never reaches the model call', async () => {
    stop();
    const error = vi.fn();
    stop = startAiUsageRecording({ write: () => Promise.reject(new Error('db down')), error });
    expect(() =>
      logAiUsage({ provider: 'p', model: 'openai/gpt-oss-20b', op: 'chat', ms: 1 }),
    ).not.toThrow();
    await settle();
    expect(error).toHaveBeenCalledWith(
      '[ai.usage] could not record AI usage (ignored)',
      expect.any(Error),
    );
  });

  it('a slow write does not hold up the call', async () => {
    stop();
    let release: () => void = () => undefined;
    stop = startAiUsageRecording({
      write: () => new Promise<void>((r) => (release = r)),
    });
    const before = Date.now();
    logAiUsage({ provider: 'p', model: 'openai/gpt-oss-20b', op: 'chat', ms: 1 });
    expect(Date.now() - before).toBeLessThan(50);
    release();
  });
});

describe('toUsageEvent / workloadForOp', () => {
  it('maps every IAIService operation to its workload', () => {
    expect(workloadForOp('generateMealPlan')).toBe('mealPlan');
    expect(workloadForOp('repairRecipeLines')).toBe('swap');
    expect(workloadForOp('extractRecipeAnnotated')).toBe('importText');
    expect(workloadForOp('analyzeMealPhoto')).toBe('vision');
    expect(workloadForOp('something-new')).toBeNull();
  });

  it('prefers the chain workload over the op mapping (photo extraction is vision)', () => {
    const row = toUsageEvent(
      { provider: 'p', model: 'qwen/qwen3.8-27b', op: 'extractRecipe', ms: 1 },
      { userId: 'u1', workload: 'vision' },
    );
    expect(row.workload).toBe('vision');
  });
});
