'use client';

import { useState } from 'react';
import { TrainingExplainSheet } from '@/features/meal-plan/components/TrainingExplainSheet';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Dumbbell, Footprints } from 'lucide-react';
import type { Translator } from '@chefer/i18n';
import type { PlanTrainingBasis, PlanTrainingDay, TrainingDayNutrition } from '@chefer/types';
import { cn, formatKcal, formatNumber, trainingGlyph } from '@chefer/utils';

/** "Training day · +250 kcal, +30 g protein" — the note's first line. */
export function trainingDayLineText(
  t: Translator['t'],
  day: Pick<TrainingDayNutrition, 'kcalBonus' | 'proteinBonus' | 'kind'>,
): string {
  const kcal = formatKcal(day.kcalBonus);
  if (day.kind === 'long_run') return t('today.home.trainingDay.line.longRun.kcal', { kcal });
  if (day.kind === 'run') return t('today.home.trainingDay.line.run.kcal', { kcal });
  return t('today.home.trainingDay.line.lift.kcal', {
    kcal,
    protein: formatNumber(day.proteinBonus),
  });
}

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
  t: day,
  isToday = true,
  date,
  className,
}: {
  t: TrainingDayNutrition;
  isToday?: boolean;
  date?: Date;
  className?: string;
}) {
  const { t } = useT();
  const [whyOpen, setWhyOpen] = useState(false);
  const { proteinOnly, noNumbers } = useNumbersMode();
  if (!day.isTrainingDay) return null;
  const kind = day.kind ?? 'lift';
  const isRun = trainingGlyph(kind) === 'walk-outline';
  // WP-08: protein-only shows the protein bump of a lifting day and nothing else
  // (a run day's bump is carbs and calories; its Why? sheet is all calories).
  if (proteinOnly) {
    if (isRun) return null;
    return (
      <div
        data-testid="training-day"
        className={cn('mb-4 rounded-xl bg-[#fff3e8] px-3 py-2.5', className)}
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#944a00]">
          <Dumbbell className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0" data-testid="training-day-line">
            {/* Lane E3 "Hide numbers": the day is named, the bump is not. */}
            {noNumbers
              ? t('today.home.trainingDay.label')
              : t('today.home.trainingDay.protein', { value: formatNumber(day.proteinBonus) })}
          </span>
        </p>
      </div>
    );
  }
  const Glyph = isRun ? Footprints : Dumbbell;
  const workout = day.workoutName ?? t('today.home.trainingDay.yourWorkout');
  const done = day.reason === 'COMPLETED';
  const perKg = formatNumber(day.basis.trainingDayProteinGPerKg, { maximumFractionDigits: 1 });
  const detail = isRun
    ? t(isToday ? 'today.home.trainingDay.carbsToday' : 'today.home.trainingDay.carbsThisDay')
    : t(
        isToday
          ? done
            ? 'today.home.trainingDay.liftProtein.doneToday'
            : 'today.home.trainingDay.liftProtein.today'
          : done
            ? 'today.home.trainingDay.liftProtein.doneThisDay'
            : 'today.home.trainingDay.liftProtein.planned',
        { workout, perKg },
      );
  const explainDate = date ?? (isToday ? new Date() : null);
  return (
    <div
      data-testid="training-day"
      className={cn(
        'mb-4 rounded-xl px-3 py-2.5',
        day.applied ? 'bg-[#fff3e8]' : 'border border-dashed border-gray-300 bg-gray-50',
        className,
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold',
          day.applied ? 'text-[#944a00]' : 'text-gray-700',
        )}
      >
        <Glyph className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{trainingDayLineText(t, day)}</span>
      </p>
      {day.applied && (
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2">
          <p className="min-w-0 text-xs text-[#944a00]/80">{detail}</p>
          {explainDate && (
            <button
              type="button"
              onClick={() => setWhyOpen(true)}
              className="inline-flex min-h-11 items-center px-1 text-xs font-semibold text-[#944a00] underline-offset-2 hover:underline"
            >
              {t('today.home.trainingDay.why')}
            </button>
          )}
        </div>
      )}
      {whyOpen && explainDate && (
        <TrainingWhy t={day} date={explainDate} open={whyOpen} onClose={() => setWhyOpen(false)} />
      )}
    </div>
  );
}

/** JS weekday (0 = Sun) → the plan's 0 = Monday. */
function planDayOf(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 6 : js - 1;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

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
  const { t: tr } = useT();
  const { data: view } = trpc.targets.get.useQuery(undefined, { staleTime: 60_000 });
  const dayOfWeek = planDayOf(date);
  const dayKey = DAY_KEYS[dayOfWeek];
  const day: PlanTrainingDay = {
    dayOfWeek,
    dayName: dayKey ? tr(`common.weekdays.${dayKey}`) : '',
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
