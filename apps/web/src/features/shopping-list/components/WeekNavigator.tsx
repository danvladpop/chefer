'use client';

import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WeekNavigatorProps {
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
  weekStart: Date;
  weekEnd: Date;
}

export function WeekNavigator({
  weekOffset,
  onOffsetChange,
  weekStart,
  weekEnd,
}: WeekNavigatorProps) {
  const arrowCls =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-30 sm:h-8 sm:w-8';

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        onClick={() => onOffsetChange(weekOffset - 1)}
        disabled={weekOffset <= -52}
        className={arrowCls}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* min-w-[180px] plus two arrows overflowed a 320px screen. The label
          flexes instead, and drops the year below sm. */}
      <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-neutral-700 sm:flex-none sm:basis-[180px]">
        <span className="hidden sm:inline">
          Week of {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
        </span>
        <span className="sm:hidden">
          {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM')}
        </span>
      </span>

      <button
        onClick={() => onOffsetChange(weekOffset + 1)}
        disabled={weekOffset >= 1}
        className={arrowCls}
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
