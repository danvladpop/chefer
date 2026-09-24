'use client';

import { useCallback } from 'react';
import { Timer } from 'lucide-react';
import { cn } from '@chefer/utils';
import {
  adjustRest,
  notifyRestDone,
  playRestDoneSound,
  REST_ADJUST_STEP_SEC,
  skipRest,
  useRestRemaining,
} from '../rest-timer';
import { formatClock } from '../workout-model';

/**
 * Sticky rest bar (starts on ✓ of a working set): countdown, −15 / +15, Skip.
 * Sits above the bottom tab bar below lg, at the bottom of the scroll pane
 * at lg+. It owns the ticking, so nothing else re-renders each second.
 */
export function RestTimerBar() {
  const onDone = useCallback(() => {
    playRestDoneSound();
    notifyRestDone();
  }, []);
  const { remainingSec, state } = useRestRemaining(onDone);

  if (!state || remainingSec <= 0) return null;
  const pct = Math.min(100, (remainingSec / Math.max(1, state.durationSec)) * 100);

  return (
    <div
      className="sticky bottom-nav-safe z-20 mt-4 lg:bottom-0"
      role="timer"
      aria-live="off"
      aria-label={`Rest ${formatClock(remainingSec)} left`}
      data-testid="gym-rest-timer"
    >
      <div className="overflow-hidden rounded-2xl border bg-gray-900 text-white shadow-lg">
        <div className="h-1 bg-white/10">
          <div
            className="h-full bg-[#f5a35c] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <Timer className="h-5 w-5 shrink-0 text-[#f5a35c]" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-xl font-bold tabular-nums">
            {formatClock(remainingSec)}
          </span>
          <TimerButton
            onClick={() => adjustRest(-REST_ADJUST_STEP_SEC)}
            label="Subtract 15 seconds"
          >
            −15
          </TimerButton>
          <TimerButton onClick={() => adjustRest(REST_ADJUST_STEP_SEC)} label="Add 15 seconds">
            +15
          </TimerButton>
          <TimerButton onClick={skipRest} label="Skip rest" wide>
            Skip
          </TimerButton>
        </div>
      </div>
    </div>
  );
}

function TimerButton({
  onClick,
  label,
  children,
  wide = false,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/20',
        wide ? 'px-3' : 'w-11',
      )}
    >
      {children}
    </button>
  );
}
