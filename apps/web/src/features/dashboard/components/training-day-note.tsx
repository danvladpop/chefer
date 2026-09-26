'use client';

import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { Dumbbell, Lock } from 'lucide-react';
import type { TrainingDayNutrition } from '@chefer/types';
import { cn, trainingDayLine } from '@chefer/utils';

/**
 * Training-aware nutrition (audit P2-4): the line on a lifter's training day,
 * shared by Today (nutrition summary) and the tracker. Premium sees the bump
 * applied to the targets; free sees the same numbers locked, with the
 * upgrade one tap away.
 *
 * `isToday` = false on the tracker's other days: the copy then says "this
 * day" instead of "today".
 */
export function TrainingDayNote({
  t,
  isToday = true,
  className,
}: {
  t: TrainingDayNutrition;
  isToday?: boolean;
  className?: string;
}) {
  if (!t.isTrainingDay) return null;
  const workout = t.workoutName ?? 'Your workout';
  const when = t.reason === 'COMPLETED' ? 'done' : isToday ? 'today' : 'planned';
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
        <Dumbbell className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{trainingDayLine(t)}</span>
      </p>
      {t.applied ? (
        <p className="mt-0.5 text-xs text-[#944a00]/80">
          {workout} {when} · protein at {t.basis.trainingDayProteinGPerKg} g/kg, added to{' '}
          {isToday ? 'today' : 'this day'}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-xs text-gray-600">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Premium adds this to {isToday ? 'today' : 'this day'}&apos;s targets
          </span>
          <UpgradeButton source="training-day" />
        </div>
      )}
    </div>
  );
}
