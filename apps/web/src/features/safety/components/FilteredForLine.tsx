'use client';

import { Filter } from 'lucide-react';
import { cn, filteredForLineText } from '@chefer/utils';

// PAT-2 — "Filtered for" (UX-02 §5, T-02.5): sits at the top of any list a
// safety filter shortened (Discover, cookbook search, Replace picker, AI
// Chef ideas). Web parity of the mobile `filtered-for-line.tsx`.

export interface FilteredForLineProps {
  /** e.g. "vegan + gluten-free". */
  filters: string;
  hiddenCount: number;
  onOpenSheet?: () => void;
  className?: string;
}

export function FilteredForLine({
  filters,
  hiddenCount,
  onOpenSheet,
  className,
}: FilteredForLineProps) {
  const label = filteredForLineText(filters, hiddenCount);
  const content = (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );

  if (!onOpenSheet) {
    return (
      <div className={cn('py-1.5', className)} aria-label={label}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenSheet}
      className={cn(
        'min-h-11 rounded-md py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      aria-label={label}
    >
      {content}
    </button>
  );
}
