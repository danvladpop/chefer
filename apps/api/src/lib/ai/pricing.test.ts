import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  estimateCostMicroUsd,
  FALLBACK_PRICE,
  microToUsd,
  MODEL_PRICES,
  priceFor,
  resetPricingWarnings,
  usdToMicro,
} from './pricing.js';

describe('AI price table', () => {
  beforeEach(() => resetPricingWarnings());

  it('prices tokens per million: tokens × USD/1M = micro-USD', () => {
    // gpt-oss-120b on Groq: 0.15 in / 0.60 out
    expect(
      estimateCostMicroUsd({
        model: 'openai/gpt-oss-120b',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(750_000);
    expect(
      estimateCostMicroUsd({ model: 'openai/gpt-oss-120b', inputTokens: 2_000, outputTokens: 500 }),
    ).toBe(600); // 2000×0.15 + 500×0.60
  });

  it('bills cached input at the cached rate and never more cached than input', () => {
    // 10k input of which 8k cached: 2k×0.15 + 8k×0.075 = 300 + 600
    expect(
      estimateCostMicroUsd({
        model: 'openai/gpt-oss-120b',
        inputTokens: 10_000,
        cachedInputTokens: 8_000,
      }),
    ).toBe(900);
    // No cached rate listed → the input rate
    expect(
      estimateCostMicroUsd({
        model: 'gemini-2.5-flash',
        inputTokens: 1_000,
        cachedInputTokens: 1_000,
      }),
    ).toBe(300);
    // A bogus cached count larger than the input is clamped
    expect(
      estimateCostMicroUsd({
        model: 'openai/gpt-oss-120b',
        inputTokens: 1_000,
        cachedInputTokens: 5_000,
      }),
    ).toBe(75);
  });

  it('reasoning tokens bill as output — they are part of outputTokens, never added twice', () => {
    const withReasoning = estimateCostMicroUsd({
      model: 'qwen/qwen3.8-27b',
      inputTokens: 1_000,
      outputTokens: 3_000, // of which, say, 2,000 reasoning
    });
    expect(withReasoning).toBe(1_000 * 0.8 + 3_000 * 4.0);
  });

  it('prices Whisper per audio hour and flux per image', () => {
    expect(estimateCostMicroUsd({ model: 'whisper-large-v3-turbo', audioSeconds: 3_600 })).toBe(
      40_000,
    );
    expect(estimateCostMicroUsd({ model: 'whisper-large-v3-turbo', audioSeconds: 90 })).toBe(1_000);
    expect(estimateCostMicroUsd({ model: '@cf/black-forest-labs/flux-1-schnell', images: 1 })).toBe(
      640,
    );
    expect(estimateCostMicroUsd({ model: 'pollinations', images: 10 })).toBe(0);
  });

  it('has every model the owner listed, at the listed price', () => {
    expect(MODEL_PRICES['openai/gpt-oss-20b']).toMatchObject({
      inputPerMTok: 0.075,
      outputPerMTok: 0.3,
    });
    expect(MODEL_PRICES['gemini-2.5-flash-lite']).toMatchObject({
      inputPerMTok: 0.1,
      outputPerMTok: 0.4,
    });
    expect(MODEL_PRICES['@cf/openai/gpt-oss-120b']).toMatchObject({
      inputPerMTok: 0.35,
      outputPerMTok: 0.75,
    });
    expect(MODEL_PRICES['@cf/openai/gpt-oss-20b']).toMatchObject({
      inputPerMTok: 0.2,
      outputPerMTok: 0.3,
    });
    expect(MODEL_PRICES['@cf/google/gemma-4-26b-a4b-it']).toMatchObject({
      inputPerMTok: 0.1,
      outputPerMTok: 0.3,
    });
  });

  it('accepts Gemini model ids with a models/ prefix', () => {
    expect(priceFor('models/gemini-2.5-flash').known).toBe(true);
  });

  it('prices an unknown model conservatively and warns once per model', () => {
    const warn = vi.fn();
    const cost = estimateCostMicroUsd(
      { model: 'new/model-x', inputTokens: 1_000, outputTokens: 1_000 },
      warn,
    );
    expect(cost).toBe(1_000 * FALLBACK_PRICE.inputPerMTok + 1_000 * FALLBACK_PRICE.outputPerMTok);
    estimateCostMicroUsd({ model: 'new/model-x', inputTokens: 1 }, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('new/model-x');
    // The fallback is above every listed text model, so budgets trip early.
    for (const price of Object.values(MODEL_PRICES)) {
      expect(FALLBACK_PRICE.inputPerMTok).toBeGreaterThanOrEqual(price.inputPerMTok);
      expect(FALLBACK_PRICE.outputPerMTok).toBeGreaterThanOrEqual(price.outputPerMTok);
    }
  });

  it('ignores missing, negative and non-finite counts', () => {
    expect(
      estimateCostMicroUsd({
        model: 'openai/gpt-oss-120b',
        inputTokens: -5,
        outputTokens: Number.NaN,
      }),
    ).toBe(0);
  });

  it('converts between USD and micro-USD', () => {
    expect(usdToMicro(25)).toBe(25_000_000);
    expect(microToUsd(1_234_567)).toBe(1.234567);
  });
});
