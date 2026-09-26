import type { GymBootstrap } from '@chefer/types';
import { addDaysLocal, cn, weekdayOf, weekStartOf } from '@chefer/utils';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export type WeekDayState = 'done' | 'planned' | 'rest';

export interface WeekDay {
  date: string;
  weekday: number;
  state: WeekDayState;
  isToday: boolean;
  isPast: boolean;
}

/**
 * Mon–Sun of the current week: a day with a completed session is `done`, a
 * routine's planned weekday is `planned`, anything else is `rest`. A planned
 * day that passed without a session stays neutral — never red (§1.2 #3).
 */
export function weekDays(
  bootstrap: Pick<GymBootstrap, 'recentSessions' | 'activeRoutine'>,
  today: string,
): WeekDay[] {
  const start = weekStartOf(today);
  const done = new Set(
    bootstrap.recentSessions.filter((s) => s.status === 'COMPLETED').map((s) => s.localDate),
  );
  const planned = new Set(
    (bootstrap.activeRoutine?.days ?? [])
      .map((d) => d.plannedWeekday)
      .filter((w): w is number => w !== null),
  );
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysLocal(start, i);
    const weekday = weekdayOf(date);
    return {
      date,
      weekday,
      state: done.has(date) ? 'done' : planned.has(weekday) ? 'planned' : 'rest',
      isToday: date === today,
      isPast: date < today,
    };
  });
}

export function WeekStrip({ days, className }: { days: WeekDay[]; className?: string }) {
  return (
    <ol className={cn('grid grid-cols-7 gap-1', className)} aria-label="This week">
      {days.map((day) => {
        const status =
          day.state === 'done' ? 'trained' : day.state === 'planned' ? 'planned' : 'rest day';
        return (
          <li
            key={day.date}
            className="flex min-w-0 flex-col items-center gap-1.5"
            aria-label={`${DAY_NAMES[day.weekday]}: ${status}${day.isToday ? ' (today)' : ''}`}
          >
            <span
              className={cn(
                'text-xs font-medium',
                day.isToday ? 'text-[#944a00]' : 'text-gray-500',
              )}
              aria-hidden="true"
            >
              {DAY_LABELS[day.weekday]}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'h-4 w-4 rounded-full border-2',
                day.state === 'done' && 'border-[#944a00] bg-[#944a00]',
                day.state === 'planned' &&
                  (day.isPast ? 'border-gray-300 bg-transparent' : 'border-[#944a00] bg-white'),
                day.state === 'rest' && 'border-transparent bg-gray-100',
                day.isToday && 'ring-2 ring-[#944a00]/25 ring-offset-1',
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}
