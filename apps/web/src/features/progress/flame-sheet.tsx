'use client';

import { useId } from 'react';
import { trpc } from '@/lib/trpc';
import { FLAME_MILESTONES, type ProgressSummary } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  activeDaysLabel,
  cn,
  flameBestLabel,
  flameWeeksLabel,
  localDateStr,
  PROGRESS_COPY,
} from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';
import { FlameDots } from './flame-dots';
import { PauseFlameCard } from './pause-flame-card';

// ─── Flame sheet (mockup 05, lane C6) ─────────────────────────────────────────
// Opened by tapping the Today strip: the big week count, "Best: N weeks.", this
// week's dots with the explainer, pilot lights, the milestone row (the next one
// dashed), the training streak, the weekly-goal picker and pause/resume.
// A `Sheet` (MO-02 enter/exit comes from the primitive).

const GOALS = [1, 2, 3, 4, 5, 6, 7] as const;

export function WeeklyGoalSelect({
  goal,
  label = PROGRESS_COPY.changeGoal,
  hint,
  className,
}: {
  goal: number;
  /** The row's label: "Change weekly goal" in the sheet, the setting's name on Preferences. */
  label?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const utils = trpc.useUtils();
  const setGoal = trpc.progress.setActiveDayGoal.useMutation({
    onSuccess: () => {
      void utils.progress.summary.invalidate();
    },
  });
  return (
    <div
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 rounded-card border bg-white px-4 py-2',
        className,
      )}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-gray-900">
          {label}
        </label>
        {hint && <p className="text-xs text-gray-600">{hint}</p>}
      </div>
      <select
        id={id}
        value={goal}
        disabled={setGoal.isPending}
        onChange={(e) =>
          setGoal.mutate({ goal: Number(e.target.value), localDate: localDateStr() })
        }
        className="min-h-11 shrink-0 rounded-control border bg-white px-2 text-sm font-semibold text-[#944a00]"
      >
        {GOALS.map((n) => (
          <option key={n} value={n}>
            {PROGRESS_WEB_COPY.goalDaysOption(n)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FlameSheet({
  open,
  onClose,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  summary: ProgressSummary;
}) {
  const { flame } = summary;
  const week = flame.thisWeek;
  return (
    <Sheet open={open} onClose={onClose} title={PROGRESS_COPY.flameTitle} size="md">
      <div className="flex flex-col gap-4 px-5 pb-5" data-testid="flame-sheet">
        <div className="text-center">
          <p className="text-4xl" aria-hidden="true">
            🔥
          </p>
          {flame.current > 0 ? (
            <p className="mt-1 text-4xl font-bold text-orange-600" data-testid="flame-count">
              {flameWeeksLabel(flame.current)}
            </p>
          ) : (
            <p className="mt-1 text-base font-semibold text-gray-800">{PROGRESS_COPY.flameZero}</p>
          )}
          {flame.best > 0 && (
            <p className="mt-1 text-sm text-gray-600">{flameBestLabel(flame.best)}</p>
          )}
        </div>

        <section aria-labelledby="flame-this-week" className="rounded-card border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 id="flame-this-week" className="text-sm font-semibold text-gray-900">
              {PROGRESS_WEB_COPY.thisWeek}
            </h3>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {activeDaysLabel(week.activeDays, week.goal)}
            </span>
          </div>
          <FlameDots days={week.days} labels="short" className="mt-3" />
          <p className="mt-3 text-sm text-gray-600">{PROGRESS_COPY.flameActiveDayExplainer}</p>
        </section>

        <section className="flex items-start gap-3 rounded-card border bg-white p-4">
          <span aria-hidden="true" className="text-2xl">
            🪔
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              {PROGRESS_COPY.pilotLightsTitle}: {flame.pilotLights}
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">{PROGRESS_COPY.pilotLightsBody}</p>
          </div>
        </section>

        <section aria-labelledby="flame-milestones">
          <h3 id="flame-milestones" className="mb-2 text-sm font-semibold text-gray-900">
            {PROGRESS_COPY.flameMilestonesTitle}
          </h3>
          <ul className="grid grid-cols-5 gap-2">
            {FLAME_MILESTONES.map((m) => {
              const reached = flame.best >= m;
              const isNext = flame.nextMilestone === m;
              return (
                <li
                  key={m}
                  data-state={reached ? 'reached' : isNext ? 'next' : 'locked'}
                  className="flex min-w-0 flex-col items-center gap-1 text-center"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-12 w-full items-center justify-center rounded-card border text-xl',
                      reached && 'border-orange-300 bg-orange-100',
                      isNext && 'border-2 border-dashed border-[#944a00] bg-white',
                      !reached && !isNext && 'bg-gray-50 grayscale',
                    )}
                  >
                    {m >= 52 ? '👑' : '🔥'}
                  </span>
                  <span
                    className={cn('text-xs text-gray-600', isNext && 'font-semibold text-gray-900')}
                  >
                    {m} {PROGRESS_WEB_COPY.weeksAbbrev}
                    {isNext && ` · ${PROGRESS_WEB_COPY.next}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {flame.training && (
          <section
            data-testid="flame-training"
            className="flex items-center justify-between gap-3 rounded-card border bg-white p-4"
          >
            <h3 className="min-w-0 text-sm font-semibold text-gray-900">
              {PROGRESS_COPY.trainingRow}
            </h3>
            <p className="shrink-0 text-sm text-gray-600">
              {flameWeeksLabel(flame.training.current)} · {flameBestLabel(flame.training.best)}
            </p>
          </section>
        )}

        <WeeklyGoalSelect goal={flame.goal} />
        <PauseFlameCard pausedUntil={flame.pausedUntil} />
      </div>
    </Sheet>
  );
}
