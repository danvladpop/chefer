import { useSyncExternalStore } from 'react';
import type { RebalancePreviewLike, RebalanceResultLike } from '@chefer/utils';
import { recordRebalance } from './rebalance-store';

// The week-rebalance OFFER (WP-07, UX-PLAN-09). Every log write opts in to a
// preview (`REBALANCE_PREVIEW`), so a log that would rebalance the week no
// longer rewrites future meals behind the user's back: the API answers with a
// `rebalancePreview` and nothing changes until the user taps Apply. The offer
// lives here (in memory — a stale offer is worth less than none; Plan's
// "Rebalance my week" re-asks the server) and every mounted RebalanceOffer
// shares it, the same way the Undo banner shares rebalance-store.

/** Spread into every log write's input: ask for a preview, never a silent apply. */
export const REBALANCE_PREVIEW = { rebalanceMode: 'preview' } as const;

/** What a log mutation's result carries about the rebalance (both fields optional: old APIs). */
export type RebalanceOutcome = {
  rebalance?: RebalanceResultLike | null | undefined;
  rebalancePreview?: RebalancePreviewLike | null | undefined;
};

const listeners = new Set<() => void>();
let offer: RebalancePreviewLike | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Shows `preview` as the pending offer; null (or nothing to swap or suggest) clears it. */
export function setRebalanceOffer(preview: RebalancePreviewLike | null | undefined): void {
  const next = preview && (preview.swaps.length > 0 || preview.snacks.length > 0) ? preview : null;
  if (next === offer) return;
  offer = next;
  emit();
}

export function clearRebalanceOffer(): void {
  setRebalanceOffer(null);
}

/**
 * The one call every log success makes: an auto-applied `rebalance` (older API
 * or no opt-in) feeds the Undo banner; a `rebalancePreview` becomes the offer.
 * A response that carries the preview field at all (even null) is the server's
 * latest word on the week, so it replaces an older offer; one that does not
 * (older API) leaves the offer alone.
 */
export function recordRebalanceOutcome(result: RebalanceOutcome | null | undefined): void {
  if (!result) return;
  recordRebalance(result.rebalance);
  if (result.rebalancePreview !== undefined) setRebalanceOffer(result.rebalancePreview);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const read = (): RebalancePreviewLike | null => offer;

/** The pending offer, re-rendering every mounted RebalanceOffer when it changes. */
export function useRebalanceOffer(): RebalancePreviewLike | null {
  return useSyncExternalStore(subscribe, read, read);
}

/** Test seam. */
export function resetRebalanceOfferForTests(): void {
  offer = null;
  listeners.clear();
}
