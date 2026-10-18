'use client';

import { Dumbbell, UsersRound, UtensilsCrossed } from 'lucide-react';
import { TRAINER_MODE_COPY } from '@chefer/types';
import { pressControl } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { useAppMode } from '../mode-context';
import type { AppMode } from '../nav-items';
import { NavCountBadge } from './nav-count-badge';

const OPTIONS: { value: AppMode; label: string; icon: typeof Dumbbell }[] = [
  { value: 'food', label: 'Food', icon: UtensilsCrossed },
  { value: 'gym', label: 'Gym', icon: Dumbbell },
];

/** The third segment (trainer-mode.md §5.1), for an active trainer with the flag on. */
const TRAINER_OPTION = {
  value: 'trainer' as const,
  label: TRAINER_MODE_COPY.mode.trainerSegment,
  icon: UsersRound,
};

/**
 * `Food | Gym` segmented control (gym_plan.md D3), plus `Trainer` when trainer
 * mode is available. Buttons, not links: the switch writes the mode cookie
 * before navigating, and the drawer's link count stays the destinations only.
 */
export function ModeSwitch({
  className,
  compact = false,
}: {
  className?: string;
  /** Hide the icons (tight headers). */
  compact?: boolean;
}) {
  const { mode, switchMode, trainerModeAvailable, trainerBadges } = useAppMode();
  const options = trainerModeAvailable ? [...OPTIONS, TRAINER_OPTION] : OPTIONS;
  // Three segments fit the sidebar's 224px and a 320px header only as labels.
  const showIcons = !compact && !trainerModeAvailable;
  // While in Food or Gym, the Trainer segment counts what waits there (§7.1).
  const waiting = mode !== 'trainer' ? (trainerBadges?.total ?? 0) : 0;

  return (
    <div
      role="group"
      aria-label="App mode"
      data-testid="mode-switch"
      className={cn('flex shrink-0 rounded-xl bg-gray-100 p-0.5', className)}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = mode === value;
        const badge = value === 'trainer' && waiting > 0 ? waiting : 0;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            data-testid={`mode-switch-${value}`}
            onClick={() => switchMode(value)}
            className={cn(
              // MO-01 press feedback (pressControl).
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-medium',
              pressControl,
              compact && 'min-w-11',
              // Three segments: tighter padding, and the badge anchors to the segment.
              trainerModeAvailable ? 'relative px-2' : compact ? 'px-2.5' : 'px-3',
              active ? 'bg-white text-[#944a00] shadow-sm' : 'text-gray-500 hover:text-gray-800',
            )}
          >
            {showIcons && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {label}
            {/* Absolute, so the count never widens the segment (320px header). */}
            <NavCountBadge count={badge} className="absolute -right-1 -top-1" />
          </button>
        );
      })}
    </div>
  );
}
