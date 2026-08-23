import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_OVER_CAPACITY_MESSAGE,
  isCapacityAiError,
  toFriendlyAiError,
} from './friendly-error.js';

// ─── Friendly AI-failure mapping (premium_plan.md §4.5.2) ────────────────────

/** The free-tier Gemini 429 shape that used to render raw in the import sheet. */
const gemini429 = Object.assign(
  new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota…","status":"RESOURCE_EXHAUSTED"}}',
  ),
  { status: 429 },
);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('isCapacityAiError', () => {
  it('recognises upstream 429/5xx statuses', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isCapacityAiError(Object.assign(new Error('boom'), { status }))).toBe(true);
    }
    expect(isCapacityAiError(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false);
  });

  it('recognises timeouts and aborted fetches without a status', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(isCapacityAiError(abort)).toBe(true);
    expect(isCapacityAiError(new Error('fetch failed'))).toBe(true);
    expect(isCapacityAiError(new Error('Request timed out after 10000ms'))).toBe(true);
    expect(isCapacityAiError(new Error('model is overloaded'))).toBe(true);
  });

  it('does not flag ordinary errors', () => {
    expect(isCapacityAiError(new Error('response failed validation'))).toBe(false);
    expect(isCapacityAiError('not even an error')).toBe(false);
  });
});

describe('toFriendlyAiError', () => {
  it('maps the raw Gemini 429 to the over-capacity message, never the JSON blob', () => {
    const mapped = toFriendlyAiError(gemini429, 'extractRecipe', 'fallback');
    expect(mapped).toBeInstanceOf(TRPCError);
    expect(mapped.code).toBe('SERVICE_UNAVAILABLE');
    expect(mapped.message).toBe(AI_OVER_CAPACITY_MESSAGE);
    expect(mapped.message).not.toContain('RESOURCE_EXHAUSTED');
  });

  it('keeps the raw error in the server log and as the cause', () => {
    const mapped = toFriendlyAiError(gemini429, 'extractRecipe', 'fallback');
    expect(console.error).toHaveBeenCalledWith('[AI] extractRecipe failed:', gemini429);
    expect(mapped.cause).toBe(gemini429);
  });

  it('uses the task-specific fallback for non-capacity failures', () => {
    const mapped = toFriendlyAiError(
      new Error('response failed validation'),
      'analyzeMealPhoto',
      "The chef couldn't read that photo. Try again with a clearer shot.",
    );
    expect(mapped.code).toBe('INTERNAL_SERVER_ERROR');
    expect(mapped.message).toBe(
      "The chef couldn't read that photo. Try again with a clearer shot.",
    );
  });

  it('passes TRPCErrors through untouched (quota messages keep their copy)', () => {
    const quota = new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Daily limit reached.' });
    expect(toFriendlyAiError(quota, 'extractRecipe', 'fallback')).toBe(quota);
    expect(console.error).not.toHaveBeenCalled();
  });
});
