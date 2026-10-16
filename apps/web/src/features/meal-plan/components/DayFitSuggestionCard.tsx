'use client';

import { pressControl } from '@chefer/ui';
import { cn, DAY_FIT_COPY, dayFitSuggestionCopy, type DayFitSuggestionLike } from '@chefer/utils';

// ─── Day rebalance: "one change closes it" (board DayFitSuggest) ──────────────
// Shown inside the day totals when resizing the day's open meals could not
// bring it to its target. Nothing changes until the user taps the action;
// "Leave it" just hides the card. The page owns the state (useDayFit).

export function DayFitSuggestionCard({
  dayOfWeek,
  kcal,
  suggestion,
  onApply,
  onLeave,
  pending = false,
  compact = false,
}: {
  dayOfWeek: number;
  /** The day's kcal after the resize. */
  kcal: number;
  suggestion: DayFitSuggestionLike;
  onApply: () => void;
  onLeave: () => void;
  pending?: boolean;
  /** The narrow desktop week column. */
  compact?: boolean;
}) {
  const copy = dayFitSuggestionCopy(suggestion, { dayOfWeek, kcal });
  return (
    <div
      role="group"
      aria-label="Suggestion"
      data-testid={`day-fit-suggestion-${dayOfWeek}`}
      className="mt-2 flex min-w-0 flex-col gap-2 border-t border-gray-200 pt-2"
    >
      <p className="text-xs text-gray-600">{copy.lede}</p>
      <div className="flex min-w-0 flex-col rounded-lg bg-[#fff3e8] px-3 py-2">
        <span
          data-testid="day-fit-suggestion-title"
          className="min-w-0 break-words text-sm font-semibold text-gray-900"
        >
          {copy.title}
        </span>
        <span className="text-xs text-gray-600">{copy.detail}</span>
      </div>
      <div className={cn('flex flex-wrap items-center gap-2', compact && 'flex-col items-stretch')}>
        <button
          type="button"
          data-testid="day-fit-suggestion-apply"
          disabled={pending}
          aria-busy={pending}
          onClick={onApply}
          className={cn(
            'min-h-11 min-w-0 flex-1 rounded-lg bg-[#944a00] px-3 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-60',
            pressControl,
          )}
        >
          {copy.action}
        </button>
        <button
          type="button"
          data-testid="day-fit-suggestion-leave"
          onClick={onLeave}
          className={cn(
            'min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-100',
            pressControl,
          )}
        >
          {DAY_FIT_COPY.leaveIt}
        </button>
      </div>
    </div>
  );
}
