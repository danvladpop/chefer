'use client';

import { Sparkles, X } from 'lucide-react';
import { pressControl } from '@chefer/ui';
import { cn, DAY_FIT_COPY } from '@chefer/utils';

// ─── "Portions updated for your new targets" (board PlanRefit) ────────────────
// A target change resized this plan's portions (`WeekPlanDto.portionRefit`,
// present for a week after the refit). Undo puts every resized day back
// (`mealPlan.undoPortionRefit`); the X closes the notice for good
// (`mealPlan.dismissPortionRefit`). The page owns both calls.

export function PortionRefitNotice({
  days,
  onUndo,
  onDismiss,
  pending = false,
  className,
}: {
  /** How many days the refit resized. */
  days: number;
  onUndo: () => void;
  onDismiss: () => void;
  pending?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      data-testid="plan-portion-refit"
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-xl bg-[#fff3e8] py-1 pl-4 pr-1',
        className,
      )}
    >
      <Sparkles className="mt-3 h-4 w-4 shrink-0 text-[#944a00]" aria-hidden="true" />
      <p className="flex min-w-0 flex-1 flex-col py-2">
        <span className="text-sm font-semibold text-gray-900">{DAY_FIT_COPY.refitTitle}</span>
        <span className="text-xs text-gray-600">{DAY_FIT_COPY.refitBody(days)}</span>
      </p>
      <button
        type="button"
        data-testid="plan-portion-refit-undo"
        disabled={pending}
        onClick={onUndo}
        className={cn(
          'min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-[#944a00] hover:bg-[#944a00]/10 disabled:opacity-50',
          pressControl,
        )}
      >
        {DAY_FIT_COPY.undo}
      </button>
      <button
        type="button"
        data-testid="plan-portion-refit-dismiss"
        aria-label={DAY_FIT_COPY.refitDismiss}
        disabled={pending}
        onClick={onDismiss}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-[#944a00]/10 disabled:opacity-50',
          pressControl,
        )}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
