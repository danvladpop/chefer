'use client';

import type { RoutineDto } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';

/** "Do another day instead" — the week-level edit (gym_plan.md D5b). */
export function PickDaySheet({
  open,
  onClose,
  routine,
  currentDayId,
  onPick,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  routine: RoutineDto;
  currentDayId: string | null;
  onPick: (dayId: string) => void;
  busy: boolean;
}) {
  const days = [...routine.days].sort((a, b) => a.position - b.position);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Do another day instead"
      description="Your rotation continues from the day you pick."
      size="sm"
    >
      <ul className="space-y-2 px-5 pb-5">
        {days.map((day) => {
          const current = day.id === currentDayId;
          return (
            <li key={day.id}>
              <button
                type="button"
                disabled={busy || current}
                onClick={() => onPick(day.id)}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left transition-colors',
                  current
                    ? 'border-[#944a00]/30 bg-[#fff8f0]'
                    : 'hover:border-[#944a00]/40 hover:bg-gray-50',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900">
                    {day.name}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {day.exercises.length} exercises
                  </span>
                </span>
                {current && (
                  <span className="shrink-0 text-xs font-medium text-[#944a00]">Up next</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
