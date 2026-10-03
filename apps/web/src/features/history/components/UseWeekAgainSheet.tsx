'use client';

import { trpc } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import { getWeekStartDate, userFacingErrorMessage, weekRangeLabel } from '@chefer/utils';

// "Use this week again" (UX-PLAN-11, mirror of apps/mobile's use-restore-plan):
// a past week can be copied into THIS or NEXT week. Restore used to put the
// copy back into the week it came from — a week that was already over — so it
// could never be cooked again. Shared by the My weeks cards and the past-week
// page.

const choiceCls =
  'flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-50';

export function UseWeekAgainSheet({
  planId,
  weekLabel,
  open,
  onClose,
  onDone,
}: {
  planId: string;
  /** The week being copied, e.g. "07 Sep". */
  weekLabel: string;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const utils = trpc.useUtils();
  const mutation = trpc.mealPlan.restore.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      // The copy is that week's plan now — everything derived from plans is stale.
      void utils.mealPlan.invalidate();
      void utils.dashboard.invalidate();
      void utils.tracker.invalidate();
      void utils.shoppingList.invalidate();
      onDone?.();
      onClose();
    },
  });

  const handleClose = () => {
    mutation.reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Use this week again"
      description={`Week of ${weekLabel}`}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600" data-testid="use-again-body">
          Which week should it become? It replaces whatever is planned there now — nothing is
          deleted, and the replaced plan stays in My weeks.
        </p>
        {mutation.error && (
          <p role="alert" className="text-sm text-red-600" data-testid="use-again-error">
            {userFacingErrorMessage(mutation.error)}
          </p>
        )}
        <button
          type="button"
          data-testid="use-again-this-week"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ planId, weekOffset: 0 })}
          className={`${choiceCls} bg-[#944a00] text-white hover:bg-[#7a3d00]`}
        >
          This week ({weekRangeLabel(getWeekStartDate(0))})
        </button>
        <button
          type="button"
          data-testid="use-again-next-week"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ planId, weekOffset: 1 })}
          className={`${choiceCls} border border-gray-200 text-gray-800 hover:bg-gray-50`}
        >
          Next week ({weekRangeLabel(getWeekStartDate(1))})
        </button>
        <button
          type="button"
          onClick={handleClose}
          className={`${choiceCls} text-gray-600 hover:bg-gray-50`}
        >
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
