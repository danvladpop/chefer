import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canShowNudge, markNudgeDismissed, markNudgeShown } from './nudge-cap';

// Node test env has no window — the helper only touches localStorage, so a
// Map-backed stub is enough.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  return store;
}

describe('nudge frequency cap (premium_plan.md §6.5)', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('allows the first nudge of the day', () => {
    expect(canShowNudge('post-rating')).toBe(true);
  });

  it('caps at one nudge per day across ALL sources', () => {
    markNudgeShown();
    expect(canShowNudge('post-rating')).toBe(false);
    expect(canShowNudge('monday-nudge')).toBe(false);
  });

  it('silences a dismissed source for 7 days without touching others', () => {
    markNudgeDismissed('post-rating');
    expect(canShowNudge('post-rating')).toBe(false);
    expect(canShowNudge('monday-nudge')).toBe(true);

    // 6 days later: still silenced. 8 days later: back.
    const day = 24 * 60 * 60 * 1000;
    expect(canShowNudge('post-rating', new Date(Date.now() + 6 * day))).toBe(false);
    expect(canShowNudge('post-rating', new Date(Date.now() + 8 * day))).toBe(true);
  });
});
