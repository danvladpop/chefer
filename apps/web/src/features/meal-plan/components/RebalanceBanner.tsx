'use client';

import { useEffect, useState } from 'react';
import {
  clearPendingRebalance,
  readPendingRebalance,
  REBALANCE_EVENT,
  rebalanceBannerCopy,
  undoOperations,
  type PendingRebalance,
} from '@/features/tracker/lib/rebalance-storage';
import { trpc } from '@/lib/trpc';
import { Undo2, Wand2, X } from 'lucide-react';

// ─── Week-rebalance banner (F4 Snap-to-Log) ───────────────────────────────────
// Shown after a log triggered a rebalance — on the tracker and cook mode where
// the log happened (audit F-TRK-3-2: the tracker gave no feedback) and on the
// meal-plan page: names what the chef changed and offers one-tap undo. The swap pairs arrive via the
// client-side hand-off in rebalance-storage (no schema for them — wave-0
// freeze); undo replays the previous recipes through mealPlan.replaceRecipe.

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
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState(false);

  const replaceMutation = trpc.mealPlan.replaceRecipe.useMutation();

  // localStorage only exists post-mount; the hydration render must match SSR.
  // Logging surfaces re-read when a log on this page stores new swaps.
  useEffect(() => {
    const refresh = () => setPending(readPendingRebalance());
    refresh();
    window.addEventListener(REBALANCE_EVENT, refresh);
    return () => window.removeEventListener(REBALANCE_EVENT, refresh);
  }, []);

  if (!pending || (planId !== undefined && pending.planId !== planId)) return null;

  const undo = async () => {
    if (undoing) return;
    setUndoing(true);
    setUndoError(false);
    try {
      for (const op of undoOperations(pending)) {
        if (!isMealType(op.mealType)) continue; // defensive — slots are always one of the four
        await replaceMutation.mutateAsync({ ...op, mealType: op.mealType });
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
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#944a00]/20 bg-[#fff8f0] px-4 py-3">
      <Wand2 className="h-4 w-4 shrink-0 text-[#944a00]" />
      <p className="min-w-0 flex-1 text-sm text-neutral-800">
        {rebalanceBannerCopy(pending.swaps)}
        {undoError && (
          <span className="block text-xs text-red-600">Undo failed — please try again.</span>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => void undo()}
          disabled={undoing}
          className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[#944a00] transition hover:bg-[#944a00]/10 disabled:opacity-50"
        >
          <Undo2 className="h-4 w-4" />
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
