'use client';

import { useState } from 'react';
import { TrainingExplainSheet } from '@/features/meal-plan/components/TrainingExplainSheet';
import { trpc } from '@/lib/trpc';
import { Dumbbell, Footprints } from 'lucide-react';
import type { PlanTrainingBasis, PlanTrainingDay, TrainingDayNutrition } from '@chefer/types';
import { cn, trainingDayLine, trainingGlyph } from '@chefer/utils';

/**
 * Training-aware nutrition (audit P2-4, UX-06 T-06.8): the line on a training
 * day, shared by Today (nutrition summary) and the tracker. Training-day
 * targets are free for everyone (WP-07): an applied bump shows the glyph, the
 * bonus and a `Why?` button that opens the explain dialog. When the server
 * does not apply it (an older API) the line stays as information only — never
 * an upsell.
 *
 * `isToday` = false on the tracker's other days: the copy then says "this
 * day" instead of "today". `date` names the weekday for the explain dialog;
 * without it the dialog is only offered for today.
 */
export function TrainingDayNote({
  t,
  isToday = true,
  date,
  className,
}: {
  t: TrainingDayNutrition;
  isToday?: boolean;
  date?: Date;
  className?: string;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  if (!t.isTrainingDay) return null;
  const kind = t.kind ?? 'lift';
  const isRun = trainingGlyph(kind) === 'walk-outline';
  const Glyph = isRun ? Footprints : Dumbbell;
  const workout = t.workoutName ?? 'Your workout';
  const when = t.reason === 'COMPLETED' ? 'done' : isToday ? 'today' : 'planned';
  const addedTo = isToday ? 'today' : 'this day';
  const explainDate = date ?? (isToday ? new Date() : null);
  return (
    <div
      data-testid="training-day"
      className={cn(
        'mb-4 rounded-xl px-3 py-2.5',
        t.applied ? 'bg-[#fff3e8]' : 'border border-dashed border-gray-300 bg-gray-50',
        className,
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold',
          t.applied ? 'text-[#944a00]' : 'text-gray-700',
        )}
      >
        <Glyph className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{trainingDayLine(t)}</span>
      </p>
      {t.applied && (
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2">
          <p className="min-w-0 text-xs text-[#944a00]/80">
            {isRun
              ? `Mostly carbs, added to ${addedTo}`
              : `${workout} ${when} · protein at ${t.basis.trainingDayProteinGPerKg} g/kg, added to ${addedTo}`}
          </p>
          {explainDate && (
            <button
              type="button"
              onClick={() => setWhyOpen(true)}
              className="inline-flex min-h-11 items-center px-1 text-xs font-semibold text-[#944a00] underline-offset-2 hover:underline"
            >
              Why?
            </button>
          )}
        </div>
      )}
      {whyOpen && explainDate && (
        <TrainingWhy t={t} date={explainDate} open={whyOpen} onClose={() => setWhyOpen(false)} />
      )}
    </div>
  );
}

/** JS weekday (0 = Sun) → the plan's 0 = Monday. */
function planDayOf(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 6 : js - 1;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Mounted only once `Why?` is tapped, so the targets query never runs (or
 * needs a provider) for a note nobody asked about. The rest-day numbers come
 * from the resolved targets; the training day is the one this note describes.
 */
function TrainingWhy({
  t,
  date,
  open,
  onClose,
}: {
  t: TrainingDayNutrition;
  date: Date;
  open: boolean;
  onClose: () => void;
}) {
  const { data: view } = trpc.targets.get.useQuery(undefined, { staleTime: 60_000 });
  const dayOfWeek = planDayOf(date);
  const day: PlanTrainingDay = {
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek] ?? '',
    kind: t.kind ?? 'lift',
    workoutName: t.workoutName,
    kcalBonus: t.kcalBonus,
    proteinBonus: t.proteinBonus,
    carbsBonus: t.carbsBonus ?? 0,
    done: t.reason === 'COMPLETED',
    applied: t.applied,
    // UX-FOOD-19: the day's real target, so the sheet quotes it beside the rest-day one.
    ...(t.applied &&
      view && {
        targetKcal: view.effective.dailyCalorieTarget + t.kcalBonus,
        targetProteinG: view.effective.proteinG + t.proteinBonus,
      }),
  };
  const basis: PlanTrainingBasis | null = view
    ? {
        restKcal: view.effective.dailyCalorieTarget,
        restProteinG: view.effective.proteinG,
        proteinGPerKg: t.basis.proteinGPerKg,
        bodyweightKg: t.basis.bodyweightKg,
      }
    : null;
  return <TrainingExplainSheet open={open} onClose={onClose} days={[day]} basis={basis} />;
}
