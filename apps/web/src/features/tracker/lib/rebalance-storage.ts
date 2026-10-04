// Relative import (not `@/lib/analytics`): this module is unit-tested, and
// the web vitest setup resolves relative paths only.
import {
  isPendingFresh,
  mergePendingRebalance,
  type PendingRebalance,
  type RebalancePreviewLike,
  type RebalanceResultLike,
} from '@chefer/utils';
import { capture } from '../../../lib/analytics';

// ─── Pending-rebalance hand-off (F4 Snap-to-Log) ──────────────────────────────
// A rebalance happens as a side effect of logging (tracker save, quick-add,
// photo scan, cook-mode "Made it!"). Its banner + undo show where the log
// happened (tracker, cook mode) and on the meal-plan page. Nothing in the schema stores the swap pairs (wave-0 freeze),
// so the hand-off is client-side: the logging surface stores the result here,
// the meal-plan page reads it, and undo replays the previous recipes through
// the existing mealPlan.replaceRecipe path. Tradeoff: undo is per-device and
// expires — an accepted v1 limitation noted in the handoff.

// The pure rules live in @chefer/utils so web and mobile merge and word
// swaps identically (mobile landed the merge first — audit F-TRK-3-2).
export {
  isPendingFresh,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
  type RebalancePreviewLike,
  type RebalanceResultLike,
  type RebalanceSwapLike,
} from '@chefer/utils';

/**
 * WP-07 (UX-PLAN-09): every log write sends this so the server returns an
 * offer (`rebalancePreview`) instead of silently rewriting future meals.
 * Spread it into the mutation input: `mutate({ ...REBALANCE_PREVIEW, ... })`.
 * Shipped clients that omit it keep the old auto-apply behaviour.
 */
export const REBALANCE_PREVIEW = { rebalanceMode: 'preview' } as const;

const STORAGE_KEY = 'chefer.rebalance.pending';

/** Fired on window after a log stored new swaps — banners re-read storage. */
export const REBALANCE_EVENT = 'chefer:rebalanced';

// ─── Storage (localStorage, guarded) ──────────────────────────────────────────

function safeGet(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingRebalance(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode etc. */
  }
}

export function readPendingRebalance(): PendingRebalance | null {
  const raw = safeGet();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingRebalance;
    if (!parsed.planId || !Array.isArray(parsed.swaps)) return null;
    if (!isPendingFresh(parsed)) {
      clearPendingRebalance();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * One call for every logging surface: fires the `week_rebalanced` analytics
 * event and MERGES the swap pairs into what is already pending (a second
 * rebalance used to overwrite the first, so its undo was lost — F-TRK-3-2),
 * then tells any mounted banner to refresh. Safe with null/no-op results.
 */
export function handleRebalanceResult(result: RebalanceResultLike | null | undefined): void {
  if (!result?.rebalanced || !result.planId || result.swaps.length === 0) return;
  capture('week_rebalanced');
  try {
    const merged: PendingRebalance | null = mergePendingRebalance(readPendingRebalance(), result);
    if (merged) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    else clearPendingRebalance();
    window.dispatchEvent(new Event(REBALANCE_EVENT));
  } catch {
    /* banner just won't show — the swaps themselves are already applied */
  }
}

// ─── Pending OFFER (WP-07, UX-PLAN-09) ────────────────────────────────────────
// A log in preview mode changes nothing: the server answers with the swaps it
// WOULD make. The logging surface parks that offer here (the log may happen on
// Today, the tracker or in cook mode; the banner that shows it lives on the
// tracker, cook mode and the plan), and applying it goes through
// mealPlan.applyRebalance → handleRebalanceResult → the usual Undo hand-off.

const OFFER_KEY = 'chefer.rebalance.offer';

/** An offer is a snapshot of one moment of the week: stale after a few hours. */
export const REBALANCE_OFFER_EXPIRY_MS = 6 * 60 * 60 * 1000;

export interface PendingRebalanceOffer {
  preview: RebalancePreviewLike;
  createdAt: number; // epoch ms
}

export function clearRebalanceOffer(): void {
  try {
    window.localStorage.removeItem(OFFER_KEY);
  } catch {
    /* private mode etc. */
  }
}

/** Retires the offer (applied or "Not now") and tells mounted banners to re-read. */
export function dismissRebalanceOffer(): void {
  clearRebalanceOffer();
  try {
    window.dispatchEvent(new Event(REBALANCE_EVENT));
  } catch {
    /* no window (SSR) — nothing is mounted either */
  }
}

export function readRebalanceOffer(now: number = Date.now()): PendingRebalanceOffer | null {
  try {
    const raw = window.localStorage.getItem(OFFER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingRebalanceOffer>;
    const preview = parsed.preview;
    if (
      !preview ||
      typeof preview.planId !== 'string' ||
      !Array.isArray(preview.swaps) ||
      preview.swaps.length === 0 ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null;
    }
    if (now - parsed.createdAt >= REBALANCE_OFFER_EXPIRY_MS) {
      clearRebalanceOffer();
      return null;
    }
    return { preview, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

/**
 * Parks the preview a log write returned. `null` = the server found nothing
 * to offer now (the week is on track), which also retires an older offer;
 * `undefined` = an API that does not preview, so nothing changes.
 */
export function handleRebalancePreview(preview: RebalancePreviewLike | null | undefined): void {
  if (preview === undefined) return;
  try {
    if (preview && preview.swaps.length > 0) {
      const offer: PendingRebalanceOffer = { preview, createdAt: Date.now() };
      window.localStorage.setItem(OFFER_KEY, JSON.stringify(offer));
    } else {
      clearRebalanceOffer();
    }
    window.dispatchEvent(new Event(REBALANCE_EVENT));
  } catch {
    /* the offer just won't show — nothing was changed */
  }
}

/** What every log write returns about the week: an applied result, an offer, or neither. */
export interface RebalanceOutcome {
  rebalance?: RebalanceResultLike | null | undefined;
  rebalancePreview?: RebalancePreviewLike | null | undefined;
}

/** One call for every logging surface: hands off whichever of the two came back. */
export function handleRebalanceOutcome(outcome: RebalanceOutcome | null | undefined): void {
  if (!outcome) return;
  handleRebalanceResult(outcome.rebalance);
  handleRebalancePreview(outcome.rebalancePreview);
}
