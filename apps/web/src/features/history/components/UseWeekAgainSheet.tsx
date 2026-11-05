'use client';

import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import { getWeekStartDate, userFacingErrorMessage } from '@chefer/utils';

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
  const { t, date } = useT();
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

  // "28 Sep – 4 Oct" / "28 sept. – 4 oct." (weekRangeLabel in @chefer/utils is English only).
  const weekRange = (monday: Date) => {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return t('plan.history.range', { start: date(monday, 'short'), end: date(sunday, 'short') });
  };

  const handleClose = () => {
    mutation.reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={t('plan.history.useAgainSheet.title')}
      description={t('plan.history.useAgainSheet.weekOf', { date: weekLabel })}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600" data-testid="use-again-body">
          {t('plan.history.useAgainSheet.body')}
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
          {t('plan.history.useAgainSheet.thisWeek', { range: weekRange(getWeekStartDate(0)) })}
        </button>
        <button
          type="button"
          data-testid="use-again-next-week"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ planId, weekOffset: 1 })}
          className={`${choiceCls} border border-gray-200 text-gray-800 hover:bg-gray-50`}
        >
          {t('plan.history.useAgainSheet.nextWeek', { range: weekRange(getWeekStartDate(1)) })}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className={`${choiceCls} text-gray-600 hover:bg-gray-50`}
        >
          {t('common.actions.cancel')}
        </button>
      </div>
    </Sheet>
  );
}
