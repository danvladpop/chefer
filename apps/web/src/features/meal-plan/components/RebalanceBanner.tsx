'use client';

import { useEffect, useState } from 'react';
import {
  clearPendingRebalance,
  readPendingRebalance,
  readRebalanceOffer,
  REBALANCE_EVENT,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
  type PendingRebalanceOffer,
} from '@/features/tracker/lib/rebalance-storage';
import { trpc } from '@/lib/trpc';
import { Undo2, Wand2, X } from 'lucide-react';
import { RebalanceOfferCard } from './RebalanceOffer';

// ─── Week-rebalance banner (F4 Snap-to-Log, WP-07) ────────────────────────────
// Two states, both fed by the client-side hand-off in rebalance-storage:
// - an OFFER (WP-07): a log found a gap and asks first — Preview · Apply ·
//   Not now (RebalanceOfferCard). Nothing has changed yet.
// - an APPLIED rebalance: names what the chef changed and offers one-tap undo
//   (audit F-TRK-3-2). Undo replays the previous recipes through
//   mealPlan.replaceRecipe — no schema for the swap pairs (wave-0 freeze).
// Shown on the tracker and cook mode where the log happened, and on the plan.

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealTypeName = (typeof MEAL_TYPES)[number];
const isMealType = (v: string): v is MealTypeName => (MEAL_TYPES as readonly string[]).includes(v);

interface RebalanceBannerProps {
  /**
   * The plan currently displayed — the banner only shows for its swaps.
   * Omit on logging surfaces (tracker, cook mode): any fresh swap shows there.
   */
  planId?: string | undefined;
  /** Refetch whatever the undo affects. */
  onUndone?: () => void;
}

export function RebalanceBanner({ planId, onUndone }: RebalanceBannerProps) {
  const [pending, setPending] = useState<PendingRebalance | null>(null);
  const [offer, setOffer] = useState<PendingRebalanceOffer | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState(false);

  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation({ meta: { silent: true } });

  // localStorage only exists post-mount; the hydration render must match SSR.
  // Logging surfaces re-read when a log on this page stores new swaps.
  useEffect(() => {
    const refresh = () => {
      setPending(readPendingRebalance());
      setOffer(readRebalanceOffer());
    };
    refresh();
    window.addEventListener(REBALANCE_EVENT, refresh);
    return () => window.removeEventListener(REBALANCE_EVENT, refresh);
  }, []);

  const shownOffer =
    offer && (planId === undefined || offer.preview.planId === planId) ? offer : null;
  const shownPending =
    pending && (planId === undefined || pending.planId === planId) ? pending : null;
  if (!shownPending && !shownOffer) return null;

  const undo = async () => {
    if (undoing || !shownPending) return;
    setUndoing(true);
    setUndoError(false);
    try {
      for (const op of undoOperations(shownPending)) {
        if (!isMealType(op.mealType)) continue; // defensive — slots are always one of the four
        // Rebalance only ever swaps unpinned slots, so undo puts the slot back
        // as it was: not "Your pick" (UX-PLAN-04).
        await replaceMutation.mutateAsync({ ...op, mealType: op.mealType, pinned: false });
      }
      clearPendingRebalance();
      setPending(null);
      onUndone?.();
    } catch {
      setUndoError(true);
    } finally {
      setUndoing(false);
    }
  };

  const dismiss = () => {
    clearPendingRebalance();
    setPending(null);
  };

  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3">
      {shownOffer && <RebalanceOfferCard preview={shownOffer.preview} />}
      {shownPending && (
        <div
          data-testid="rebalance-applied"
          className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[#944a00]/20 bg-[#fff8f0] px-4 py-3"
        >
          <div className="flex min-w-0 items-start gap-2">
            <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-neutral-800">
              {rebalanceBannerCopy(shownPending.swaps)}
              {undoError && (
                <span role="alert" className="block text-xs text-red-600">
                  Undo failed — please try again.
                </span>
              )}
            </p>
          </div>
          {/* Actions sit UNDER the text (WP-07: the side-by-side layout squeezed it). */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => void undo()}
              disabled={undoing}
              className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[#944a00] transition hover:bg-[#944a00]/10 disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              {undoing ? 'Undoing…' : 'Undo'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
