'use client';

import type { ReactNode } from 'react';
import { cn } from '@chefer/utils';

/**
 * Toggle chip for the exercise-library filters. `aria-pressed` carries the
 * selected state (not just the fill colour), and `min-h-11` keeps the tap
 * target at 44px.
 */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 shrink-0 rounded-full border px-3 text-xs font-medium transition',
        active
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300',
      )}
    >
      {children}
    </button>
  );
}
