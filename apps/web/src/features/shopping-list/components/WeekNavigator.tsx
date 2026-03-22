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
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onOffsetChange(weekOffset - 1)}
        disabled={weekOffset <= -52}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-30"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[180px] text-center text-sm font-medium text-neutral-700">
        Week of {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
      </span>
      <button
        onClick={() => onOffsetChange(weekOffset + 1)}
        disabled={weekOffset >= 0}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-30"
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
