// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleRebalanceOutcome,
  handleRebalancePreview,
  handleRebalanceResult,
  isPendingFresh,
  readPendingRebalance,
  readRebalanceOffer,
  REBALANCE_EVENT,
  REBALANCE_OFFER_EXPIRY_MS,
  REBALANCE_PREVIEW,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
  type RebalancePreviewLike,
  type RebalanceSwapLike,
} from './rebalance-storage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const swap = (over: Partial<RebalanceSwapLike> = {}): RebalanceSwapLike => ({
  dayOfWeek: 3,
  mealType: 'dinner',
  previousRecipeId: 'prev-1',
  newRecipeId: 'new-1',
  previousRecipeName: 'Herb Salmon',
  newRecipeName: 'Lentil Curry',
  ...over,
});

const pending = (swaps: RebalanceSwapLike[], createdAt = Date.now()): PendingRebalance => ({
  planId: 'plan-1',
  swaps,
  createdAt,
});

describe('rebalanceBannerCopy', () => {
  it('names the adjusted slot: "I adjusted Thursday dinner…"', () => {
    expect(rebalanceBannerCopy([swap()])).toBe(
      'I adjusted Thursday dinner to keep your week on track.',
    );
  });

  it('joins two swaps with "and"', () => {
    expect(rebalanceBannerCopy([swap(), swap({ dayOfWeek: 4, mealType: 'lunch' })])).toBe(
      'I adjusted Thursday dinner and Friday lunch to keep your week on track.',
    );
  });

  it('is empty with no swaps', () => {
    expect(rebalanceBannerCopy([])).toBe('');
  });
});

describe('undoOperations (F4 undo)', () => {
  it('produces one replaceRecipe call per swap, restoring previousRecipeId', () => {
    const ops = undoOperations(
      pending([swap(), swap({ dayOfWeek: 5, mealType: 'lunch', previousRecipeId: 'prev-2' })]),
    );
    expect(ops).toEqual([
      { planId: 'plan-1', dayOfWeek: 3, mealType: 'dinner', recipeId: 'prev-1' },
      { planId: 'plan-1', dayOfWeek: 5, mealType: 'lunch', recipeId: 'prev-2' },
    ]);
  });

  it('never targets the NEW recipe — undo means going back', () => {
    const ops = undoOperations(pending([swap()]));
    expect(ops[0]!.recipeId).toBe('prev-1');
    expect(ops[0]!.recipeId).not.toBe('new-1');
  });
});

describe('isPendingFresh', () => {
  it('accepts a recent hand-off and rejects a day-old one', () => {
    const now = Date.now();
    expect(isPendingFresh(pending([swap()], now - 60_000), now)).toBe(true);
    expect(isPendingFresh(pending([swap()], now - 25 * 60 * 60 * 1000), now)).toBe(false);
  });

  it('rejects a hand-off without swaps', () => {
    expect(isPendingFresh(pending([]))).toBe(false);
  });
});

describe('handleRebalanceResult merges instead of overwriting (audit F-TRK-3-2)', () => {
  it('keeps the first rebalance undoable after a second one, and pings banners', () => {
    window.localStorage.clear();
    const events: string[] = [];
    const listener = () => events.push('rebalanced');
    window.addEventListener(REBALANCE_EVENT, listener);
    const swap = (dayOfWeek: number, mealType: string, prev: string, next: string) => ({
      dayOfWeek,
      mealType,
      previousRecipeId: prev,
      newRecipeId: next,
    });
    handleRebalanceResult({
      rebalanced: true,
      planId: 'p1',
      projectedDeviation: 0.2,
      swaps: [swap(5, 'lunch', 'a', 'b'), swap(5, 'dinner', 'c', 'd')],
    });
    handleRebalanceResult({
      rebalanced: true,
      planId: 'p1',
      projectedDeviation: 0.18,
      swaps: [swap(6, 'dinner', 'e', 'f')],
    });
    window.removeEventListener(REBALANCE_EVENT, listener);
    const pending = readPendingRebalance();
    expect(pending?.swaps.map((s) => `${s.dayOfWeek}-${s.mealType}`)).toEqual([
      '5-lunch',
      '5-dinner',
      '6-dinner',
    ]);
    expect(events).toHaveLength(2);
  });
});

// ─── WP-07: the offer hand-off (preview mode) ─────────────────────────────────

const preview = (): RebalancePreviewLike => ({
  planId: 'p1',
  headline: "You're 36 g short on protein this week.",
  swaps: [swap({ dayOfWeek: 6 })],
  snacks: [],
});

describe('REBALANCE_PREVIEW', () => {
  it('is the opt-in every log write sends', () => {
    expect(REBALANCE_PREVIEW).toEqual({ rebalanceMode: 'preview' });
  });
});

describe('handleRebalancePreview (WP-07 offer)', () => {
  beforeEach(() => window.localStorage.clear());

  it('parks the offer, pings banners, and changes nothing else', () => {
    let pings = 0;
    const listener = () => (pings += 1);
    window.addEventListener(REBALANCE_EVENT, listener);
    handleRebalancePreview(preview());
    window.removeEventListener(REBALANCE_EVENT, listener);
    expect(readRebalanceOffer()?.preview.swaps).toHaveLength(1);
    // An offer is not an applied rebalance: nothing to undo yet.
    expect(readPendingRebalance()).toBeNull();
    expect(pings).toBe(1);
  });

  it('null (the week is on track) retires an older offer; undefined leaves it alone', () => {
    handleRebalancePreview(preview());
    handleRebalancePreview(undefined);
    expect(readRebalanceOffer()).not.toBeNull();
    handleRebalancePreview(null);
    expect(readRebalanceOffer()).toBeNull();
  });

  it('an offer with no swaps is not parked, and a stale one expires', () => {
    handleRebalancePreview({ ...preview(), swaps: [] });
    expect(readRebalanceOffer()).toBeNull();
    handleRebalancePreview(preview());
    expect(readRebalanceOffer(Date.now() + REBALANCE_OFFER_EXPIRY_MS + 1)).toBeNull();
  });

  it('handleRebalanceOutcome routes an applied result and an offer to their own hand-offs', () => {
    handleRebalanceOutcome({ rebalance: null, rebalancePreview: preview() });
    expect(readRebalanceOffer()).not.toBeNull();
    expect(readPendingRebalance()).toBeNull();

    window.localStorage.clear();
    handleRebalanceOutcome({
      rebalance: { rebalanced: true, planId: 'p1', projectedDeviation: 0.1, swaps: [swap()] },
    });
    expect(readPendingRebalance()?.swaps).toHaveLength(1);
    expect(readRebalanceOffer()).toBeNull();
    expect(() => handleRebalanceOutcome(null)).not.toThrow();
  });
});
