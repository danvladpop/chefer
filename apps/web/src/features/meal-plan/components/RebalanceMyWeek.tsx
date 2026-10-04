'use client';

import { useState } from 'react';
import { dismissRebalanceOffer } from '@/features/tracker/lib/rebalance-storage';
import { trpc } from '@/lib/trpc';
import { CheckCircle2, Wand2 } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { localDateStr, userFacingErrorMessage } from '@chefer/utils';
import type { RebalancePreviewLike } from '@chefer/utils';
import { RebalanceOfferView, useApplyRebalance } from './RebalanceOffer';

// ─── "Rebalance my week" on the plan (WP-07, UX-PLAN-09) ──────────────────────
// The rebalance used to be reachable only as a side effect of logging. This
// entry asks the server for what a rebalance WOULD do right now
// (`mealPlan.previewRebalance`, free for everyone, no AI) and shows the same
// offer as after a log — or "Your week is on track" when there is nothing to
// fix. Applying hands the result to the usual Undo banner on the plan.

export function RebalanceMyWeekButton({
  planId,
  className,
}: {
  planId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="rebalance-my-week"
        onClick={() => setOpen(true)}
        className={
          className ??
          'flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50'
        }
      >
        <Wand2 className="h-3.5 w-3.5 shrink-0 text-[#944a00]" aria-hidden="true" />
        Rebalance my week
      </button>
      {open && <RebalanceMyWeekSheet planId={planId} onClose={() => setOpen(false)} />}
    </>
  );
}

function RebalanceMyWeekSheet({ planId, onClose }: { planId: string; onClose: () => void }) {
  const query = trpc.mealPlan.previewRebalance.useQuery(
    { planId, localDate: localDateStr() },
    { retry: false, staleTime: 0, refetchOnMount: 'always' },
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title="Rebalance my week"
      description="Adjusts a couple of coming meals. Nothing changes until you apply it."
      size="sm"
    >
      <div className="flex min-w-0 flex-col gap-3 px-5 pb-5" data-testid="rebalance-sheet">
        {query.isLoading ? (
          <p role="status" className="text-sm text-gray-600">
            Checking your week…
          </p>
        ) : query.isError ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-red-600">
              {userFacingErrorMessage(query.error, "Couldn't check your week. Try again.")}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        ) : query.data ? (
          <OfferBody preview={query.data} onClose={onClose} onStale={() => void query.refetch()} />
        ) : (
          <div data-testid="rebalance-on-track" className="flex min-w-0 flex-col items-start gap-3">
            <p className="flex min-w-0 items-start gap-2 text-sm text-gray-800">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block font-semibold">Your week is on track</span>
                Calories and protein are close to your targets, so there is nothing to change.
              </span>
            </p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function OfferBody({
  preview,
  onClose,
  onStale,
}: {
  preview: RebalancePreviewLike;
  onClose: () => void;
  onStale: () => void;
}) {
  const { apply, applying, message } = useApplyRebalance(preview, (rebalanced) => {
    if (rebalanced) onClose();
    else onStale();
  });
  return (
    <RebalanceOfferView
      preview={preview}
      defaultExpanded
      onApply={apply}
      onNotNow={() => {
        // The same offer may be parked from a log: "Not now" retires it too.
        dismissRebalanceOffer();
        onClose();
      }}
      applying={applying}
      message={message}
    />
  );
}
