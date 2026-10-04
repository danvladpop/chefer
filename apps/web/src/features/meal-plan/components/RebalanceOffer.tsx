'use client';

import { useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import {
  dismissRebalanceOffer,
  handleRebalanceResult,
  type RebalancePreviewLike,
  type RebalanceSwapLike,
} from '@/features/tracker/lib/rebalance-storage';
import { trpc } from '@/lib/trpc';
import { ChevronDown, Wand2 } from 'lucide-react';
import { buttonVariants } from '@chefer/ui';
import {
  cn,
  describeProteinSnack,
  describeRebalanceSwap,
  describeSnackProteinOnly,
  describeSwapProteinOnly,
  localDateStr,
  proteinOnlyHeadline,
  userFacingErrorMessage,
} from '@chefer/utils';

// ─── Week-rebalance OFFER (WP-07, UX-PLAN-09) ─────────────────────────────────
// A log (or Plan's "Rebalance my week") that would change future meals asks
// first: the week's gap, what would change, and Preview · Apply · Not now.
// Nothing is rewritten until Apply, which goes through mealPlan.applyRebalance
// and hands the result to the same Undo hand-off the old auto path used.
// Layout is mobile-first: the text on top, the actions stacked UNDER it (the
// old banner squeezed them beside the copy at 320 px).

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealTypeName = (typeof MEAL_TYPES)[number];
const isMealType = (v: string): v is MealTypeName => (MEAL_TYPES as readonly string[]).includes(v);

/** The one-line "Sunday dinner → X (+28 g protein)" for a swap (B-11). */
export const swapLine = (swap: RebalanceSwapLike, proteinOnly = false): string =>
  // WP-08: the server's own explanation may quote kcal, so protein-only never uses it.
  proteinOnly ? describeSwapProteinOnly(swap) : (swap.explanation ?? describeRebalanceSwap(swap));

interface ApplyState {
  applying: boolean;
  /** Plain-words failure, or the "week changed since" note; null when fine. */
  message: string | null;
  apply: () => void;
}

/**
 * Applies an offer: `mealPlan.applyRebalance` with the swaps the user saw,
 * then the Undo hand-off. Stale or unsafe swaps are skipped server-side (never
 * an error), so `rebalanced: false` means the week moved on since the offer.
 */
export function useApplyRebalance(
  preview: RebalancePreviewLike,
  onDone?: (rebalanced: boolean) => void,
): ApplyState {
  const utils = trpc.useUtils();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = trpc.mealPlan.applyRebalance.useMutation({ meta: { silent: true } });

  const apply = () => {
    if (mutation.isPending) return;
    setMessage(null);
    const swaps = preview.swaps.flatMap((s) =>
      isMealType(s.mealType)
        ? [
            {
              dayOfWeek: s.dayOfWeek,
              mealType: s.mealType,
              ...(s.slotIndex !== undefined && { slotIndex: s.slotIndex }),
              previousRecipeId: s.previousRecipeId,
              newRecipeId: s.newRecipeId,
            },
          ]
        : [],
    );
    mutation.mutate(
      { planId: preview.planId, swaps, localDate: localDateStr() },
      {
        onSuccess: (result) => {
          // Stores the swaps for Undo (and fires week_rebalanced).
          handleRebalanceResult(result);
          void utils.mealPlan.invalidate();
          void utils.dashboard.invalidate();
          void utils.shoppingList.invalidate();
          if (result.rebalanced) {
            dismissRebalanceOffer();
          } else {
            // The week moved on since the offer: say so, keep the card so the
            // note stays readable; "Not now" retires it.
            setMessage('Those meals have changed since, so nothing was swapped.');
          }
          onDone?.(result.rebalanced);
        },
        onError: (error) =>
          setMessage(userFacingErrorMessage(error, "Couldn't rebalance your week. Try again.")),
      },
    );
  };

  return { applying: mutation.isPending, message, apply };
}

interface RebalanceOfferViewProps {
  preview: RebalancePreviewLike;
  onApply: () => void;
  onNotNow: () => void;
  applying?: boolean | undefined;
  /** An apply failure or "week changed" note, shown under the actions. */
  message?: string | null | undefined;
  /** Start with the list open (the Plan sheet already is a deliberate ask). */
  defaultExpanded?: boolean | undefined;
  className?: string | undefined;
}

export function RebalanceOfferView({
  preview,
  onApply,
  onNotNow,
  applying = false,
  message = null,
  defaultExpanded = false,
  className,
}: RebalanceOfferViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // WP-08: protein-only mode shows the protein change only, never a calorie figure.
  const { proteinOnly } = useNumbersMode();
  const headline = proteinOnly ? proteinOnlyHeadline(preview.headline) : preview.headline;
  const count = preview.swaps.length;
  const hasSwaps = count > 0;
  const hasSnacks = preview.snacks.length > 0;
  const listId = `rebalance-offer-${preview.planId}`;

  const buttonCls = 'min-h-11 shrink-0 px-4 text-sm font-semibold';

  return (
    <section
      aria-label="Week rebalance offer"
      data-testid="rebalance-offer"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-[#944a00]/20 bg-[#fff8f0] px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">
            {headline || 'I can rebalance the rest of your week.'}
          </p>
          <p className="mt-0.5 text-sm text-neutral-700">
            {hasSwaps
              ? `I can adjust ${count === 1 ? 'one coming meal' : `${count} coming meals`} to help. Nothing changes until you say so.`
              : 'A protein snack can close the gap without changing your plan.'}
          </p>
        </div>
      </div>

      {expanded && (
        <div id={listId} className="flex min-w-0 flex-col gap-2">
          {hasSwaps && (
            <ul className="flex flex-col gap-1.5">
              {preview.swaps.map((swap) => (
                <li
                  key={`${swap.dayOfWeek}-${swap.mealType}-${swap.slotIndex ?? ''}`}
                  className="min-w-0 rounded-xl bg-white/70 px-3 py-2 text-sm text-neutral-800"
                >
                  {swapLine(swap, proteinOnly)}
                </li>
              ))}
            </ul>
          )}
          {hasSnacks && (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {hasSwaps ? 'Or a protein snack' : 'Protein snack ideas'}
              </p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {preview.snacks.map((snack) => (
                  <li
                    key={snack.id}
                    className="min-w-0 rounded-xl bg-white/70 px-3 py-2 text-sm text-neutral-800"
                  >
                    {proteinOnly ? describeSnackProteinOnly(snack) : describeProteinSnack(snack)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={listId}
          className={cn(buttonVariants({ variant: 'outline' }), buttonCls)}
        >
          {expanded ? 'Hide preview' : 'Preview'}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'transition-transform duration-instant ease-standard',
              expanded && 'rotate-180',
            )}
          />
        </button>
        {hasSwaps && (
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            aria-label={count === 1 ? 'Apply the rebalance' : `Apply all ${count} changes`}
            className={cn(
              buttonVariants(),
              buttonCls,
              'bg-[#944a00] text-white hover:bg-[#7a3d00] active:bg-[#7a3d00]',
            )}
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        )}
        <button
          type="button"
          onClick={onNotNow}
          disabled={applying}
          className={cn(buttonVariants({ variant: 'ghost' }), buttonCls, 'text-neutral-600')}
        >
          Not now
        </button>
      </div>

      {message && (
        <p role="alert" className="min-w-0 text-xs text-red-600">
          {message}
        </p>
      )}
    </section>
  );
}

/** The offer a log parked, wired to Apply / Not now. */
export function RebalanceOfferCard({
  preview,
  className,
}: {
  preview: RebalancePreviewLike;
  className?: string | undefined;
}) {
  const { apply, applying, message } = useApplyRebalance(preview);
  return (
    <RebalanceOfferView
      preview={preview}
      onApply={apply}
      onNotNow={dismissRebalanceOffer}
      applying={applying}
      message={message}
      className={className}
    />
  );
}
