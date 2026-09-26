'use client';

import { Dumbbell, UtensilsCrossed } from 'lucide-react';
import { pressControl } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { useAppMode } from '../mode-context';
import type { AppMode } from '../nav-items';

const OPTIONS: { value: AppMode; label: string; icon: typeof Dumbbell }[] = [
  { value: 'food', label: 'Food', icon: UtensilsCrossed },
  { value: 'gym', label: 'Gym', icon: Dumbbell },
];

/**
 * `Food | Gym` segmented control (gym_plan.md D3). Buttons, not links: the
 * switch writes the mode cookie before navigating, and the drawer's link
 * count stays the destinations only.
 */
export function ModeSwitch({
  className,
  compact = false,
}: {
  className?: string;
  /** Hide the icons (tight headers). */
  compact?: boolean;
}) {
  const { mode, switchMode } = useAppMode();

  return (
    <div
      role="group"
      aria-label="App mode"
      data-testid="mode-switch"
      className={cn('flex shrink-0 rounded-xl bg-gray-100 p-0.5', className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            data-testid={`mode-switch-${value}`}
            onClick={() => switchMode(value)}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-medium',
              pressControl,
              compact ? 'min-w-11 px-2.5' : 'px-3',
              active ? 'bg-white text-[#944a00] shadow-sm' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {!compact && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
