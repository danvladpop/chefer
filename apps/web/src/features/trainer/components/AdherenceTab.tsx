import { formatShortDay, weekdayIndexOf, weekdayName } from '@/features/coaching/lib/dates';
import {
  COACHING_LIMITS,
  type AdherenceDayDto,
  type AdherenceDto,
  type WeekStatus,
} from '@chefer/types';
import { cn } from '@chefer/utils';

// ─── Adherence (spec §2.5 tab 3) ──────────────────────────────────────────────
// Eight weeks against the client's goal and a 14-day strip of planned days. A
// pause shows as "Paused" with its dates only: the reason is never shared.

const WEEK_LABEL: Record<WeekStatus, string> = {
  met: 'Goal met',
  flex: 'Goal met',
  under: 'Missed',
  paused: 'Paused',
  empty: 'No sessions',
  current: 'This week',
};

type DayState = 'trained' | 'missed' | 'paused' | 'rest';

export function dayState(day: AdherenceDayDto): DayState {
  if (day.trained) return 'trained';
  if (day.paused) return 'paused';
  return day.planned ? 'missed' : 'rest';
}

const DAY_LABEL: Record<DayState, string> = {
  trained: 'Trained',
  missed: 'Missed',
  paused: 'Paused',
  rest: 'Rest',
};

const DAY_TONE: Record<DayState, string> = {
  trained: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  missed: 'border-amber-300 bg-amber-50 text-amber-900',
  paused: 'border-sky-200 bg-sky-50 text-sky-800',
  rest: 'border-gray-200 bg-white text-gray-500',
};

export function AdherenceView({ adherence }: { adherence: AdherenceDto }) {
  const weeks = adherence.weeks.slice(-COACHING_LIMITS.adherenceWeeks);
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="adherence-weeks"
        className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 id="adherence-weeks" className="font-semibold text-gray-900">
          Last 8 weeks
        </h2>
        <ul className="mt-3 flex flex-col divide-y divide-gray-100">
          {weeks.map((week) => (
            <li
              key={week.weekStart}
              className="flex min-w-0 items-center justify-between gap-3 py-2 text-sm"
              data-testid="adherence-week"
            >
              <span className="min-w-0 text-gray-700">
                Week of {formatShortDay(week.weekStart)}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-medium text-gray-900">
                  {week.sessions} / {week.goal}
                </span>
                <span className="w-20 text-right text-xs text-gray-500">
                  {WEEK_LABEL[week.status]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="adherence-days"
        className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 id="adherence-days" className="font-semibold text-gray-900">
          Last 14 days
        </h2>
        <ul className="mt-3 grid grid-cols-7 gap-1.5" data-testid="adherence-strip">
          {adherence.days.map((day) => {
            const state = dayState(day);
            const weekday = weekdayName(weekdayIndexOf(day.localDate) ?? 0);
            const label = `${weekday} ${formatShortDay(day.localDate)}: ${DAY_LABEL[state]}`;
            return (
              <li
                key={day.localDate}
                aria-label={label}
                data-state={state}
                className={cn(
                  'flex min-w-0 flex-col items-center rounded-lg border px-0.5 py-1.5 text-center',
                  DAY_TONE[state],
                )}
              >
                <span className="text-xs">{weekday}</span>
                <span className="text-xs font-semibold">{Number(day.localDate.slice(8, 10))}</span>
                <span className="text-xs" aria-hidden="true">
                  {state === 'trained'
                    ? '✓'
                    : state === 'missed'
                      ? '✕'
                      : state === 'paused'
                        ? '‖'
                        : '·'}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          ✓ trained · ✕ planned, missed · ‖ paused · · rest
        </p>
      </section>
    </div>
  );
}
