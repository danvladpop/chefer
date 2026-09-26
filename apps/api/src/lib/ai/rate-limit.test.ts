import { describe, expect, it } from 'vitest';
import {
  parseDurationMs,
  parseRetryAfterHeader,
  parseTryAgainIn,
  retryAfterFrom,
  TokenRateState,
} from './rate-limit.js';

describe('Groq duration parsing', () => {
  it('reads the x-ratelimit-reset / "try again in" formats', () => {
    expect(parseDurationMs('8.79s')).toBe(8790);
    expect(parseDurationMs('250ms')).toBe(250);
    expect(parseDurationMs('1m2.5s')).toBe(62_500);
    expect(parseDurationMs('2h3m')).toBe(7_380_000);
    expect(parseDurationMs('7')).toBe(7000);
    expect(parseDurationMs('soon')).toBeUndefined();
    expect(parseDurationMs(null)).toBeUndefined();
  });

  it('finds the wait in a Groq 429 body', () => {
    const body =
      '{"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` … on tokens per minute (TPM): Limit 8000, Used 7981, Requested 598. Please try again in 4.358s. Need more tokens?"}}';
    expect(parseTryAgainIn(body)).toBe(4358);
    expect(parseTryAgainIn('Please try again in 1m30s.')).toBe(90_000);
    expect(parseTryAgainIn('no hint')).toBeUndefined();
  });

  it('prefers the Retry-After header over the body hint', () => {
    expect(parseRetryAfterHeader('3')).toBe(3000);
    expect(retryAfterFrom(new Headers({ 'retry-after': '2' }), 'try again in 9s')).toBe(2000);
    expect(retryAfterFrom(new Headers(), 'try again in 9s')).toBe(9000);
    expect(retryAfterFrom(new Headers(), '')).toBeUndefined();
  });
});

describe('TokenRateState', () => {
  const headers = (limit: number, remaining: number) =>
    new Headers({
      'x-ratelimit-limit-tokens': String(limit),
      'x-ratelimit-remaining-tokens': String(remaining),
    });

  it('does not wait before the endpoint has reported anything', () => {
    expect(new TokenRateState().waitMsFor(5000)).toBe(0);
  });

  it('waits for the refill a call needs (limit per 60 s, continuous)', () => {
    let t = 0;
    const state = new TokenRateState(() => t);
    state.record(headers(8000, 500));
    // 1,700 missing tokens at 8,000/60 s = 12.75 s.
    expect(state.waitMsFor(2200)).toBe(12_750);
    t = 6_000; // 800 tokens refilled since
    expect(state.waitMsFor(2200)).toBe(6_750);
    t = 60_000;
    expect(state.waitMsFor(2200)).toBe(0);
    expect(state.limit).toBe(8000);
  });

  it('never waits for a call that fits now or can never fit', () => {
    const state = new TokenRateState(() => 0);
    state.record(headers(8000, 7000));
    expect(state.waitMsFor(2000)).toBe(0);
    expect(state.waitMsFor(9000)).toBe(0);
  });

  it('ignores responses without rate-limit headers', () => {
    const state = new TokenRateState(() => 0);
    state.record(headers(8000, 100));
    state.record(new Headers());
    expect(state.waitMsFor(1000)).toBeGreaterThan(0);
  });
});
