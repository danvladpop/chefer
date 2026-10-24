'use client';

import { Check, Moon } from 'lucide-react';
import type { FlameDayState } from '@chefer/types';
import { cn } from '@chefer/utils';

// Mon–Sun dots (mockups 01 and 05): done = a check, a quiet past day = a moon
// ("rest", never a miss), today = a ringed dot, later this week = grey.

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const STATE_TEXT: Record<FlameDayState, string> = {
  active: 'active day',
  rest: 'rest day',
  today: 'today',
  future: 'coming up',
};

function Dot({ state }: { state: FlameDayState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full',
        state === 'active' && 'bg-gradient-to-b from-amber-400 to-orange-500 text-white',
        state === 'rest' && 'bg-sky-100 text-sky-700',
        state === 'today' && 'border-2 border-[#944a00] bg-white',
        state === 'future' && 'bg-gray-100',
      )}
    >
      {state === 'active' && <Check className="h-4 w-4" strokeWidth={3} />}
      {state === 'rest' && <Moon className="h-4 w-4" />}
      {state === 'today' && <span className="h-1 w-1 rounded-full bg-[#944a00]" />}
    </span>
  );
}

export function FlameDots({
  days,
  labels = 'letter',
  className,
}: {
  days: readonly FlameDayState[];
  /** `letter` for the Today strip (M T W…), `short` for the Flame sheet (Mon Tue…). */
  labels?: 'letter' | 'short';
  className?: string;
}) {
  return (
    <ul className={cn('flex min-w-0 items-start justify-between gap-1', className)}>
      {days.map((state, i) => (
        <li key={DAY_NAMES[i]} className="flex min-w-0 flex-col items-center gap-1">
          <span aria-hidden="true" className="text-xs font-semibold text-gray-600">
            {labels === 'letter' ? DAY_LETTERS[i] : DAY_SHORT[i]}
          </span>
          <Dot state={state} />
          <span className="sr-only">{`${DAY_NAMES[i]}: ${STATE_TEXT[state]}`}</span>
        </li>
      ))}
    </ul>
  );
}
