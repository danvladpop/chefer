import { beforeEach, describe, expect, it } from 'vitest';
import { consume, resetRateLimits } from './rate-limit.js';

const WINDOW = 60_000;

describe('consume (sliding-window rate limiter)', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('allows up to max hits inside the window', () => {
    const t0 = 1_000_000;
    expect(consume('k', 3, WINDOW, t0)).toBe(true);
    expect(consume('k', 3, WINDOW, t0 + 1)).toBe(true);
    expect(consume('k', 3, WINDOW, t0 + 2)).toBe(true);
    expect(consume('k', 3, WINDOW, t0 + 3)).toBe(false);
  });

  it('slides: old hits expire individually, not per fixed interval', () => {
    const t0 = 1_000_000;
    consume('k', 2, WINDOW, t0);
    consume('k', 2, WINDOW, t0 + 30_000);
    // Window full at t0+59s…
    expect(consume('k', 2, WINDOW, t0 + 59_000)).toBe(false);
    // …but the t0 hit expires at t0+60s, freeing one slot.
    expect(consume('k', 2, WINDOW, t0 + 60_001)).toBe(true);
    // The t0+30s hit still counts, so the bucket is full again.
    expect(consume('k', 2, WINDOW, t0 + 60_002)).toBe(false);
  });

  it('keys are independent', () => {
    const t0 = 1_000_000;
    expect(consume('a', 1, WINDOW, t0)).toBe(true);
    expect(consume('a', 1, WINDOW, t0 + 1)).toBe(false);
    expect(consume('b', 1, WINDOW, t0 + 2)).toBe(true);
  });

  it('a denied attempt does not consume a slot', () => {
    const t0 = 1_000_000;
    consume('k', 1, WINDOW, t0);
    // Hammering while blocked must not extend the lockout past the window.
    for (let i = 1; i <= 100; i++) {
      expect(consume('k', 1, WINDOW, t0 + i)).toBe(false);
    }
    expect(consume('k', 1, WINDOW, t0 + WINDOW + 1)).toBe(true);
  });
});
